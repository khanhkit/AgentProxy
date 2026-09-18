use std::collections::HashSet;

use async_stream::stream;
use axum::{
    body::{Body, Bytes},
    extract::{OriginalUri, State},
    http::{header, HeaderMap, HeaderName, Method, StatusCode},
    response::Response,
};

use futures_util::StreamExt;

use crate::{
    shutdown::wait_for_force_shutdown, transport_policy::validate_secret_bearing_url, AppState,
};

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
    if state.is_draining() {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "gateway is shutting down");
    }

    let Some(base_url) = state.legacy_base_url() else {
        return json_error(
            StatusCode::NOT_FOUND,
            "legacy control-plane proxy is not configured",
        );
    };
    if let Err(error) = validate_secret_bearing_url(&base_url) {
        return json_error(
            StatusCode::BAD_GATEWAY,
            &format!("legacy upstream rejected: {error}"),
        );
    }
    let target = format!(
        "{}{}",
        base_url,
        uri.path_and_query()
            .map(|value| value.as_str())
            .unwrap_or(uri.path())
    );

    let connection_nominated = connection_nominated_headers(&headers);
    let mut request = state.http_client().request(method, target).body(body);
    for (name, value) in &headers {
        if !is_hop_by_hop(name)
            && !connection_nominated.contains(name)
            && name != header::HOST
            && name != header::CONTENT_LENGTH
        {
            request = request.header(name, value);
        }
    }

    let mut force_shutdown = state.force_shutdown_receiver();
    let upstream = tokio::select! {
        biased;
        _ = wait_for_force_shutdown(&mut force_shutdown) => {
            return json_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "gateway shutdown drain deadline exceeded",
            );
        }
        result = request.send() => match result {
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
        }
    };

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();
    let connection_nominated = connection_nominated_headers(&upstream_headers);
    let upstream_stream = upstream.bytes_stream();
    let body_stream = stream! {
        futures_util::pin_mut!(upstream_stream);
        loop {
            tokio::select! {
                biased;
                _ = wait_for_force_shutdown(&mut force_shutdown) => {
                    eprintln!("[agentproxy-rust] terminating legacy HTTP stream after shutdown drain deadline");
                    break;
                }
                item = upstream_stream.next() => match item {
                    Some(item) => yield item,
                    None => break,
                }
            }
        }
    };
    let mut response = Response::builder().status(status);
    if let Some(output_headers) = response.headers_mut() {
        for (name, value) in &upstream_headers {
            if !is_hop_by_hop(name)
                && !connection_nominated.contains(name)
                && name != header::CONTENT_LENGTH
            {
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

fn connection_nominated_headers(headers: &HeaderMap) -> HashSet<HeaderName> {
    let mut nominated = HashSet::new();
    for value in headers.get_all(header::CONNECTION).iter() {
        for raw_token in value.as_bytes().split(|byte| *byte == b',') {
            let token = trim_optional_whitespace(raw_token);
            if token.is_empty() {
                continue;
            }
            if let Ok(name) = HeaderName::from_bytes(token) {
                nominated.insert(name);
            }
        }
    }
    nominated
}

fn trim_optional_whitespace(mut value: &[u8]) -> &[u8] {
    while matches!(value.first(), Some(b' ' | b'\t')) {
        value = &value[1..];
    }
    while matches!(value.last(), Some(b' ' | b'\t')) {
        value = &value[..value.len() - 1];
    }
    value
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::to_bytes, http::HeaderValue};
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        sync::oneshot,
        time::{timeout, Duration},
    };

    #[tokio::test]
    async fn draining_rejects_new_legacy_http_admission() {
        let state = AppState::new();
        state.begin_shutdown();

        let response = proxy_request(
            &state,
            Method::GET,
            &"/v1/models".parse().expect("test URI should parse"),
            HeaderMap::new(),
            Bytes::new(),
        )
        .await;

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body = to_bytes(response.into_body(), 1024)
            .await
            .expect("shutdown response should be bounded");
        assert!(String::from_utf8_lossy(&body).contains("gateway is shutting down"));
    }

    #[tokio::test]
    async fn force_shutdown_terminates_active_legacy_http_stream() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("loopback listener should bind");
        let address = listener.local_addr().expect("listener should have address");
        let (headers_sent_tx, headers_sent_rx) = oneshot::channel();
        let upstream = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("upstream should accept");
            let mut request = vec![0_u8; 8192];
            let _ = stream
                .read(&mut request)
                .await
                .expect("request should read");
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n9\r\ndata: x\n\n\r\n",
                )
                .await
                .expect("streaming response should write");
            let _ = headers_sent_tx.send(());
            tokio::time::sleep(Duration::from_secs(5)).await;
        });

        let state = AppState::new_with_legacy_base_url(format!("http://{address}"));
        let response = proxy_request(
            &state,
            Method::GET,
            &"/v1/models".parse().expect("test URI should parse"),
            HeaderMap::new(),
            Bytes::new(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        headers_sent_rx
            .await
            .expect("upstream should send streaming headers");

        let body_task = tokio::spawn(async move { to_bytes(response.into_body(), 1024).await });
        tokio::task::yield_now().await;
        state.force_shutdown();

        let body = timeout(Duration::from_secs(1), body_task)
            .await
            .expect("force shutdown should terminate the response stream")
            .expect("body task should join")
            .expect("forced response stream should close cleanly");
        assert!(body.len() <= 9);

        upstream.abort();
        let _ = upstream.await;
    }

    #[tokio::test]
    async fn ap_iss_0086_connection_nominated_headers_do_not_cross_proxy_boundaries() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("loopback listener should bind");
        let address = listener.local_addr().expect("listener should have address");
        let upstream = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("upstream should accept");
            let mut bytes = vec![0_u8; 8192];
            let size = stream.read(&mut bytes).await.expect("request should read");
            let request = String::from_utf8_lossy(&bytes[..size]).to_string();
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nConnection: bad header, x-hop-response, , keep-alive\r\nX-Hop-Response: drop-me\r\nX-End-To-End-Response: preserve-me\r\nContent-Length: 2\r\n\r\nok",
                )
                .await
                .expect("response should write");
            request
        });

        let state = AppState::new_with_legacy_base_url(format!("http://{address}"));
        let mut headers = HeaderMap::new();
        headers.insert(
            header::CONNECTION,
            HeaderValue::from_static("bad header, x-hop-request, , keep-alive"),
        );
        headers.insert(
            HeaderName::from_static("x-hop-request"),
            HeaderValue::from_static("drop-me"),
        );
        headers.insert(
            HeaderName::from_static("x-end-to-end-request"),
            HeaderValue::from_static("preserve-me"),
        );

        let response = proxy_request(
            &state,
            Method::GET,
            &"/v1/models".parse().expect("test URI should parse"),
            headers,
            Bytes::new(),
        )
        .await;
        let upstream_request = upstream.await.expect("upstream task should finish");
        let upstream_request = upstream_request.to_ascii_lowercase();

        assert_eq!(response.status(), StatusCode::OK);
        assert!(!upstream_request.contains("\r\nx-hop-request:"));
        assert!(upstream_request.contains("\r\nx-end-to-end-request: preserve-me"));
        assert!(response.headers().get("x-hop-response").is_none());
        assert_eq!(
            response
                .headers()
                .get("x-end-to-end-response")
                .and_then(|value| value.to_str().ok()),
            Some("preserve-me")
        );
    }
}
