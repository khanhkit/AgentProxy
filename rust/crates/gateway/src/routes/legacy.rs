use axum::{
    body::{Body, Bytes},
    extract::{OriginalUri, State},
    http::{header, HeaderMap, HeaderName, Method, StatusCode},
    response::Response,
};

use crate::AppState;

pub async fn proxy(
    State(state): State<AppState>,
    method: Method,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    proxy_request(&state, method, &uri, headers, body).await
}

pub(crate) async fn proxy_request(
    state: &AppState,
    method: Method,
    uri: &axum::http::Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !is_legacy_api_path(uri.path()) {
        return json_error(
            StatusCode::NOT_FOUND,
            "API port only serves API-compatible routes",
        );
    }

    let Some(base_url) = state.legacy_base_url() else {
        return json_error(
            StatusCode::NOT_FOUND,
            "legacy control-plane proxy is not configured",
        );
    };
    let target = format!(
        "{}{}",
        base_url,
        uri.path_and_query()
            .map(|value| value.as_str())
            .unwrap_or(uri.path())
    );

    let mut request = state.http_client().request(method, target).body(body);
    for (name, value) in &headers {
        if !is_hop_by_hop(name) && name != header::HOST && name != header::CONTENT_LENGTH {
            request = request.header(name, value);
        }
    }

    let upstream = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            return json_error(
                StatusCode::BAD_GATEWAY,
                &format!(
                    "legacy API proxy unavailable: {}",
                    classify_reqwest_error(&error)
                ),
            );
        }
    };

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();
    let body_stream = upstream.bytes_stream();
    let mut response = Response::builder().status(status);
    if let Some(output_headers) = response.headers_mut() {
        for (name, value) in &upstream_headers {
            if !is_hop_by_hop(name) && name != header::CONTENT_LENGTH {
                output_headers.append(name, value.clone());
            }
        }
    }

    response
        .body(Body::from_stream(body_stream))
        .unwrap_or_else(|_| {
            json_error(
                StatusCode::BAD_GATEWAY,
                "failed to build legacy proxy response",
            )
        })
}

fn is_legacy_api_path(path: &str) -> bool {
    path == "/v1"
        || path.starts_with("/v1/")
        || path == "/chat/completions"
        || path.starts_with("/chat/completions/")
        || path == "/responses"
        || path.starts_with("/responses/")
        || path == "/models"
        || path.starts_with("/models/")
        || path == "/codex"
        || path.starts_with("/codex/")
        || path == "/api/oauth"
        || path.starts_with("/api/oauth/")
        || path == "/callback"
}

fn is_hop_by_hop(name: &HeaderName) -> bool {
    matches!(
        name.as_str().to_ascii_lowercase().as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
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
            "type": "gateway_error"
        }
    });
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(body.to_string()))
        .expect("static JSON error response is valid")
}
