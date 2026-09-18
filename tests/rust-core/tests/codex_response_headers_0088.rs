use agentproxy_control_protocol::snapshot::{
    ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::{app, AppState};
use axum::{
    body::Body,
    http::{header, HeaderMap, HeaderValue, Request, StatusCode},
    response::Response,
    routing::post,
    Router,
};
use http_body_util::BodyExt;
use sha2::{Digest, Sha256};
use tokio::net::TcpListener;
use tower::ServiceExt;

fn api_key(secret: &str) -> ApiKeyConfig {
    ApiKeyConfig {
        id: "response-header-client".to_owned(),
        key_hash: format!("{:x}", Sha256::digest(secret.as_bytes())),
        allowed_connections: vec![],
        allowed_endpoints: vec!["chat".to_owned()],
        unsupported_policy: false,
    }
}

fn snapshot(base_url: String) -> ConfigSnapshot {
    ConfigSnapshot {
        schema_version: SUPPORTED_SCHEMA_VERSION,
        source_id: "response-headers-0088".to_owned(),
        generation: 1,
        api_keys: vec![api_key("client-secret")],
        codex_connections: vec![CodexConnectionConfig {
            id: "headers-account".to_owned(),
            access_token: "provider-token".to_owned(),
            workspace_id: None,
            base_url,
            max_concurrent: Some(2),
            credential_version: 1,
        }],
        codex_catalog_models: vec!["gpt-5.6-sol".to_owned()],
        codex_native_models: vec!["gpt-5.6-sol".to_owned()],
    }
}

fn request() -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/v1/responses")
        .header("content-type", "application/json")
        .header("authorization", "Bearer client-secret")
        .body(Body::from(r#"{"model":"gpt-5.6-sol","input":[]}"#))
        .unwrap()
}

async fn spawn_upstream(status: StatusCode, headers: HeaderMap, body: &'static str) -> String {
    let app = Router::new().route(
        "/responses",
        post(move || {
            let headers = headers.clone();
            async move {
                let mut response = Response::builder()
                    .status(status)
                    .body(Body::from(body))
                    .unwrap();
                response.headers_mut().extend(headers);
                response
            }
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}")
}

fn insert(headers: &mut HeaderMap, name: &'static str, value: &'static str) {
    headers.insert(name, HeaderValue::from_static(value));
}

#[tokio::test]
async fn streaming_success_preserves_only_safe_response_metadata() {
    let mut headers = HeaderMap::new();
    insert(&mut headers, "content-type", "text/event-stream");
    insert(&mut headers, "x-request-id", "provider-request-123");
    insert(&mut headers, "x-ratelimit-remaining-requests", "7");
    insert(&mut headers, "x-ratelimit-reset-requests", "2s");
    insert(&mut headers, "set-cookie", "provider-secret=cookie");
    insert(&mut headers, "x-provider-secret", "must-not-pass");
    insert(&mut headers, "connection", "close");
    let upstream = spawn_upstream(
        StatusCode::OK,
        headers,
        "event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\n\n",
    )
    .await;
    let state = AppState::new();
    state.install_snapshot(snapshot(upstream), false).unwrap();

    let response = app(state).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("x-request-id"),
        Some(&HeaderValue::from_static("provider-request-123"))
    );
    assert_eq!(
        response.headers().get("x-ratelimit-remaining-requests"),
        Some(&HeaderValue::from_static("7"))
    );
    assert_eq!(
        response.headers().get("x-ratelimit-reset-requests"),
        Some(&HeaderValue::from_static("2s"))
    );
    assert!(response.headers().get(header::SET_COOKIE).is_none());
    assert!(response.headers().get("x-provider-secret").is_none());
    assert_eq!(
        response.headers().get(header::CONNECTION),
        Some(&HeaderValue::from_static("keep-alive"))
    );
    response.into_body().collect().await.unwrap();
}

#[tokio::test]
async fn buffered_provider_error_preserves_safe_ids_without_secret_headers() {
    let mut headers = HeaderMap::new();
    insert(&mut headers, "content-type", "application/json");
    insert(&mut headers, "openai-request-id", "provider-error-456");
    insert(&mut headers, "x-ratelimit-limit-requests", "100");
    insert(&mut headers, "set-cookie", "secret=cookie");
    insert(&mut headers, "x-api-key", "provider-secret");
    let upstream = spawn_upstream(
        StatusCode::BAD_REQUEST,
        headers,
        r#"{"error":{"message":"bad input","type":"invalid_request_error"}}"#,
    )
    .await;
    let state = AppState::new();
    state.install_snapshot(snapshot(upstream), false).unwrap();

    let response = app(state).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert_eq!(
        response.headers().get("openai-request-id"),
        Some(&HeaderValue::from_static("provider-error-456"))
    );
    assert_eq!(
        response.headers().get("x-ratelimit-limit-requests"),
        Some(&HeaderValue::from_static("100"))
    );
    assert!(response.headers().get(header::SET_COOKIE).is_none());
    assert!(response.headers().get("x-api-key").is_none());
}

#[tokio::test]
async fn retry_exhaustion_returns_clamped_retry_after_and_request_id() {
    let mut headers = HeaderMap::new();
    insert(&mut headers, "content-type", "application/json");
    insert(&mut headers, "retry-after", "999999");
    insert(&mut headers, "x-request-id", "rate-limit-789");
    insert(&mut headers, "set-cookie", "secret=cookie");
    let upstream = spawn_upstream(StatusCode::TOO_MANY_REQUESTS, headers, "{}").await;
    let state = AppState::new();
    state.install_snapshot(snapshot(upstream), false).unwrap();

    let response = app(state).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert_eq!(
        response.headers().get(header::RETRY_AFTER),
        Some(&HeaderValue::from_static("300"))
    );
    assert_eq!(
        response.headers().get("x-request-id"),
        Some(&HeaderValue::from_static("rate-limit-789"))
    );
    assert!(response.headers().get(header::SET_COOKIE).is_none());
}

#[tokio::test]
async fn invalid_retry_after_is_ignored() {
    let mut headers = HeaderMap::new();
    insert(&mut headers, "content-type", "application/json");
    insert(&mut headers, "retry-after", "not-a-retry-time");
    let upstream = spawn_upstream(StatusCode::TOO_MANY_REQUESTS, headers, "{}").await;
    let state = AppState::new();
    state.install_snapshot(snapshot(upstream), false).unwrap();

    let response = app(state).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert!(response.headers().get(header::RETRY_AFTER).is_none());
}

#[tokio::test]
async fn duplicate_or_oversized_safe_headers_are_dropped() {
    let mut headers = HeaderMap::new();
    headers.append(
        "x-request-id",
        HeaderValue::from_static("provider-request-first"),
    );
    headers.append(
        "x-request-id",
        HeaderValue::from_static("provider-request-second"),
    );
    headers.insert(
        "x-ratelimit-reset",
        HeaderValue::from_str(&"9".repeat(300)).unwrap(),
    );
    let upstream = spawn_upstream(
        StatusCode::OK,
        headers,
        r#"event: response.completed
data: {"type":"response.completed","response":{"status":"completed"}}

"#,
    )
    .await;
    let state = AppState::new();
    state.install_snapshot(snapshot(upstream), false).unwrap();

    let response = app(state).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().get("x-request-id").is_none());
    assert!(response.headers().get("x-ratelimit-reset").is_none());
    response.into_body().collect().await.unwrap();
}

#[tokio::test]
async fn duplicate_retry_after_is_ignored() {
    let mut headers = HeaderMap::new();
    headers.append(header::RETRY_AFTER, HeaderValue::from_static("10"));
    headers.append(header::RETRY_AFTER, HeaderValue::from_static("20"));
    let upstream = spawn_upstream(StatusCode::TOO_MANY_REQUESTS, headers, "{}").await;
    let state = AppState::new();
    state.install_snapshot(snapshot(upstream), false).unwrap();

    let response = app(state).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    assert!(response.headers().get(header::RETRY_AFTER).is_none());
}
