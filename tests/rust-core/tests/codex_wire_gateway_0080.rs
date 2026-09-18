use agentproxy_control_protocol::snapshot::{
    ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::{app, AppState};
use axum::{
    body::Body,
    http::{HeaderMap, Request, StatusCode},
    response::Response,
    routing::post,
    Router,
};
use http_body_util::BodyExt;
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio::net::TcpListener;
use tower::ServiceExt;

fn header(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

async fn spawn_header_echo_upstream() -> String {
    async fn responses(headers: HeaderMap) -> Response {
        let observed = json!({
            "type": "response.created",
            "version": header(&headers, "version"),
            "user_agent": header(&headers, "user-agent"),
            "x_codex_session_id": header(&headers, "x-codex-session-id"),
            "x_codex_window_id": header(&headers, "x-codex-window-id"),
            "authorization": header(&headers, "authorization"),
            "originator": header(&headers, "originator"),
            "account_id": header(&headers, "chatgpt-account-id"),
            "session_id": header(&headers, "session_id"),
            "x_api_key": header(&headers, "x-api-key"),
            "turn_state": header(&headers, "x-codex-turn-state")
        });
        let event = format!("event: response.created\ndata: {observed}\n\n");
        Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "text/event-stream")
            .body(Body::from(event))
            .unwrap()
    }

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, Router::new().route("/responses", post(responses)))
            .await
            .unwrap();
    });
    format!("http://{address}")
}

fn api_key(secret: &str) -> ApiKeyConfig {
    ApiKeyConfig {
        id: "wire-client".to_owned(),
        key_hash: format!("{:x}", Sha256::digest(secret.as_bytes())),
        allowed_connections: vec![],
        allowed_endpoints: vec!["chat".to_owned()],
        unsupported_policy: false,
    }
}

#[tokio::test]
async fn native_route_preserves_only_v1_safe_client_headers() {
    let upstream = spawn_header_echo_upstream().await;
    let state = AppState::new();
    state
        .install_snapshot(
            ConfigSnapshot {
                schema_version: SUPPORTED_SCHEMA_VERSION,
                source_id: "wire-v1".to_owned(),
                generation: 1,
                api_keys: vec![api_key("client-secret")],
                codex_connections: vec![CodexConnectionConfig {
                    id: "wire-account".to_owned(),
                    access_token: "provider-token".to_owned(),
                    workspace_id: Some("workspace-a".to_owned()),
                    base_url: upstream,
                    max_concurrent: Some(2),
                    credential_version: 1,
                }],
                codex_catalog_models: vec!["gpt-5.6-sol".to_owned()],
                codex_native_models: vec!["gpt-5.6-sol".to_owned()],
            },
            false,
        )
        .unwrap();

    let request = Request::builder()
        .method("POST")
        .uri("/v1/responses")
        .header("content-type", "application/json")
        .header("authorization", "Bearer client-secret")
        .header("version", "0.154.0")
        .header("user-agent", "codex-cli/0.154.0 (linux; x86_64)")
        .header("x-codex-session-id", "client-session")
        .header("x-codex-window-id", "window-42")
        .header("originator", "attacker")
        .header("chatgpt-account-id", "other-workspace")
        .header("session_id", "attacker-session")
        .header("x-api-key", "must-not-forward")
        .header("x-codex-turn-state", "opaque-account-bound-state")
        .body(Body::from(
            r#"{"model":"gpt-5.6-sol","prompt_cache_key":"prompt-session","input":[]}"#,
        ))
        .unwrap();

    let response = app(state).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8_lossy(&body);

    for expected in [
        r#""version":"0.154.0""#,
        r#""user_agent":"codex-cli/0.154.0 (linux; x86_64)""#,
        r#""x_codex_session_id":"client-session""#,
        r#""x_codex_window_id":"window-42""#,
        r#""authorization":"Bearer provider-token""#,
        r#""originator":"codex_cli_rs""#,
        r#""account_id":"workspace-a""#,
        r#""session_id":"prompt-session""#,
        r#""x_api_key":null"#,
        r#""turn_state":null"#,
    ] {
        assert!(
            text.contains(expected),
            "missing wire observation {expected}: {text}"
        );
    }
}
