use agentproxy_providers::codex::{
    adapter::{CodexAdapter, PreparedRequest},
    stream_classifier::{classify_precommit_sse_event, CodexPrecommitClass},
};
use agentproxy_stream::sse::SseFramer;
use async_stream::stream;
use axum::{
    body::{Body, Bytes},
    extract::{OriginalUri, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    response::Response,
};
use futures_util::StreamExt;

use crate::{routes::legacy, ApiKeyAuthError, AppState, SelectedCodexAccount};

const MAX_PRECOMMIT_EVENT_BYTES: usize = 64 * 1024;
const MAX_PRECOMMIT_BUFFER_BYTES: usize = 256 * 1024;

pub async fn responses(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let mut input: serde_json::Value = match serde_json::from_slice::<serde_json::Value>(&body) {
        Ok(value) if value.is_object() => value,
        _ => return json_error(StatusCode::BAD_REQUEST, "invalid JSON request body"),
    };

    let native_model = input
        .get("model")
        .and_then(serde_json::Value::as_str)
        .and_then(|model| state.resolve_native_codex_model(model));
    let Some(native_model) = native_model else {
        return legacy::proxy_request(&state, Method::POST, &uri, headers, body).await;
    };
    if let Some(record) = input.as_object_mut() {
        record.insert("model".to_owned(), serde_json::Value::String(native_model));
    }

    let Some(client_key) = extract_client_key(&headers) else {
        return json_error(StatusCode::UNAUTHORIZED, "missing API key");
    };
    let authorized = match state.authorize_api_key(client_key, "chat") {
        Ok(authorized) => authorized,
        Err(ApiKeyAuthError::Invalid) => {
            return json_error(StatusCode::UNAUTHORIZED, "invalid API key");
        }
        Err(ApiKeyAuthError::UnsupportedPolicy) => {
            return json_error(
                StatusCode::FORBIDDEN,
                "API key policy is not supported by the Rust inference core",
            );
        }
        Err(ApiKeyAuthError::EndpointDenied) => {
            return json_error(
                StatusCode::FORBIDDEN,
                "API key cannot access chat endpoints",
            );
        }
    };

    let mut tried_ids = Vec::<String>::new();
    let mut last_error = "no eligible Codex account".to_owned();

    loop {
        let excluded: Vec<&str> = tried_ids.iter().map(String::as_str).collect();
        let Some(selected) =
            state.select_codex_account_for(&authorized.allowed_connections, &excluded)
        else {
            let status = if tried_ids.is_empty() {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::BAD_GATEWAY
            };
            return json_error(status, &last_error);
        };

        let account_id = selected.config.id.clone();
        let prepared = match CodexAdapter::prepare(uri.path(), input.clone(), &selected.config) {
            Ok(prepared) => prepared,
            Err(_) => return json_error(StatusCode::BAD_REQUEST, "unsupported Codex request"),
        };

        match execute_attempt(&state, prepared, selected).await {
            AttemptOutcome::Response(response) => return response,
            AttemptOutcome::Retry(reason) => {
                tried_ids.push(account_id);
                last_error = reason;
            }
        }
    }
}

fn extract_client_key(headers: &HeaderMap) -> Option<&str> {
    if let Some(value) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
    {
        let value = value.trim();
        if let Some(token) = value
            .strip_prefix("Bearer ")
            .or_else(|| value.strip_prefix("bearer "))
        {
            let token = token.trim();
            if !token.is_empty() {
                return Some(token);
            }
        }
    }

    headers
        .get("x-api-key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

enum AttemptOutcome {
    Response(Response),
    Retry(String),
}

async fn execute_attempt(
    state: &AppState,
    prepared: PreparedRequest,
    selected: SelectedCodexAccount,
) -> AttemptOutcome {
    let mut request = state
        .http_client()
        .post(&prepared.url)
        .body(prepared.body.to_string());
    for (name, value) in &prepared.headers {
        request = request.header(name, value);
    }

    let upstream = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            return AttemptOutcome::Retry(format!(
                "Codex upstream connection failed for account {}: {}",
                selected.config.id,
                classify_reqwest_error(&error)
            ));
        }
    };

    let status = upstream.status();
    let content_type = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .cloned()
        .unwrap_or_else(|| HeaderValue::from_static("application/octet-stream"));

    if prepared.compact {
        return buffered_upstream_response(upstream, status, content_type, selected).await;
    }

    if !status.is_success() {
        if retryable_http_status(status) {
            return AttemptOutcome::Retry(format!(
                "Codex upstream returned retryable HTTP {} for account {}",
                status.as_u16(),
                selected.config.id
            ));
        }
        return buffered_upstream_response(upstream, status, content_type, selected).await;
    }

    let mut upstream_stream = upstream.bytes_stream();
    let mut framer = SseFramer::new(MAX_PRECOMMIT_EVENT_BYTES);
    let mut buffered = Vec::<Bytes>::new();
    let mut buffered_bytes = 0usize;

    loop {
        let Some(item) = upstream_stream.next().await else {
            return AttemptOutcome::Retry(format!(
                "Codex upstream ended before first event for account {}",
                selected.config.id
            ));
        };

        let chunk = match item {
            Ok(chunk) => chunk,
            Err(error) => {
                return AttemptOutcome::Retry(format!(
                    "Codex upstream stream failed before commit for account {}: {}",
                    selected.config.id,
                    classify_reqwest_error(&error)
                ));
            }
        };

        buffered_bytes = buffered_bytes.saturating_add(chunk.len());
        if buffered_bytes > MAX_PRECOMMIT_BUFFER_BYTES {
            return AttemptOutcome::Response(json_error(
                StatusCode::BAD_GATEWAY,
                "Codex upstream did not produce a bounded first SSE event",
            ));
        }

        let frames = match framer.push(&chunk) {
            Ok(frames) => frames,
            Err(_) => {
                return AttemptOutcome::Response(json_error(
                    StatusCode::BAD_GATEWAY,
                    "Codex upstream first SSE event exceeded safety limit",
                ));
            }
        };
        buffered.push(chunk);

        for frame in frames {
            match classify_precommit_sse_event(&frame) {
                CodexPrecommitClass::Ignore => continue,
                CodexPrecommitClass::RetryableError => {
                    return AttemptOutcome::Retry(format!(
                        "Codex upstream returned transient SSE error for account {}",
                        selected.config.id
                    ));
                }
                CodexPrecommitClass::Valid | CodexPrecommitClass::FatalError => {
                    return AttemptOutcome::Response(streaming_response(
                        buffered,
                        upstream_stream,
                        selected,
                    ));
                }
            }
        }
    }
}

async fn buffered_upstream_response(
    upstream: reqwest::Response,
    status: StatusCode,
    content_type: HeaderValue,
    selected: SelectedCodexAccount,
) -> AttemptOutcome {
    let body = match upstream.bytes().await {
        Ok(body) => body,
        Err(error) => {
            return AttemptOutcome::Response(json_error(
                StatusCode::BAD_GATEWAY,
                &format!(
                    "failed reading Codex upstream response: {}",
                    classify_reqwest_error(&error)
                ),
            ));
        }
    };
    drop(selected);

    AttemptOutcome::Response(
        Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, content_type)
            .header(header::CACHE_CONTROL, "no-store")
            .body(Body::from(body))
            .expect("static buffered response headers are valid"),
    )
}

fn streaming_response<S>(
    buffered: Vec<Bytes>,
    upstream: S,
    selected: SelectedCodexAccount,
) -> Response
where
    S: futures_util::Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    let body_stream = stream! {
        let _account_lease = selected;
        let upstream = upstream;
        futures_util::pin_mut!(upstream);
        for chunk in buffered {
            yield Ok::<Bytes, reqwest::Error>(chunk);
        }
        while let Some(item) = upstream.next().await {
            yield item;
        }
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-cache, no-transform")
        .header("x-accel-buffering", "no")
        .header(header::CONNECTION, "keep-alive")
        .header("access-control-allow-origin", "*")
        .body(Body::from_stream(body_stream))
        .expect("static streaming response headers are valid")
}

fn retryable_http_status(status: StatusCode) -> bool {
    matches!(
        status,
        StatusCode::UNAUTHORIZED
            | StatusCode::FORBIDDEN
            | StatusCode::REQUEST_TIMEOUT
            | StatusCode::TOO_MANY_REQUESTS
            | StatusCode::INTERNAL_SERVER_ERROR
            | StatusCode::BAD_GATEWAY
            | StatusCode::SERVICE_UNAVAILABLE
            | StatusCode::GATEWAY_TIMEOUT
    )
}

fn classify_reqwest_error(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "timeout"
    } else if error.is_connect() {
        "connect error"
    } else if error.is_request() {
        "request error"
    } else {
        "stream error"
    }
}

fn json_error(status: StatusCode, message: &str) -> Response {
    let body = serde_json::json!({
        "error": {
            "message": message,
            "type": "agentproxy_gateway_error"
        }
    });
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(body.to_string()))
        .expect("static JSON error response headers are valid")
}
