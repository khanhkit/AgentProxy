use agentproxy_control_protocol::snapshot::{
    ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::{app, AppState};
use axum::{
    body::Body,
    http::{Request, StatusCode},
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
        id: "error-boundary-client".to_owned(),
        key_hash: format!("{:x}", Sha256::digest(secret.as_bytes())),
        allowed_connections: vec![],
        allowed_endpoints: vec!["chat".to_owned()],
        unsupported_policy: false,
    }
}

fn connection(id: &str, base_url: String) -> CodexConnectionConfig {
    CodexConnectionConfig {
        id: id.to_owned(),
        access_token: format!("token-{id}"),
        workspace_id: None,
        base_url,
        max_concurrent: Some(2),
        credential_version: 1,
    }
}

fn snapshot(connections: Vec<CodexConnectionConfig>) -> ConfigSnapshot {
    ConfigSnapshot {
        schema_version: SUPPORTED_SCHEMA_VERSION,
        source_id: "error-boundary-0085".to_owned(),
        generation: 1,
        api_keys: vec![api_key("client-secret")],
        codex_connections: connections,
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

async fn spawn_status(
    status: StatusCode,
    body: &'static str,
    content_type: &'static str,
) -> String {
    let app = Router::new().route(
        "/responses",
        post(move || async move {
            Response::builder()
                .status(status)
                .header("content-type", content_type)
                .body(Body::from(body))
                .unwrap()
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}")
}

#[tokio::test]
async fn exhausted_retry_public_error_hides_internal_account_ids_and_has_correlation_id() {
    let first = spawn_status(StatusCode::UNAUTHORIZED, "nope", "text/plain").await;
    let second = spawn_status(StatusCode::UNAUTHORIZED, "nope", "text/plain").await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(vec![
                connection("internal-account-alpha", first),
                connection("internal-account-bravo", second),
            ]),
            false,
        )
        .unwrap();

    let response = app(state).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8_lossy(&body);

    assert!(!text.contains("internal-account-alpha"));
    assert!(!text.contains("internal-account-bravo"));
    assert!(text.contains("\"error_id\""), "{text}");
    assert!(
        text.contains("Codex upstream rejected credentials"),
        "{text}"
    );
    let public: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let root = public.as_object().unwrap();
    assert_eq!(
        root.keys()
            .map(String::as_str)
            .collect::<std::collections::BTreeSet<_>>(),
        ["error", "error_id"].into_iter().collect()
    );
    assert!(root["error_id"]
        .as_str()
        .is_some_and(|error_id| error_id.starts_with("apx-")));
}

#[tokio::test]
async fn provider_error_json_is_bounded_allowlisted_and_secret_extensions_are_removed() {
    const CANARY: &str = "SECRET_CANARY_TOKEN_HASH_0085";
    let provider_body = r#"{
        "error": {
            "message": "bad request from provider",
            "type": "invalid_request_error",
            "code": "bad_input",
            "param": "input",
            "token_hash": "SECRET_CANARY_TOKEN_HASH_0085",
            "credential": {"access_token":"SECRET_CANARY_TOKEN_HASH_0085"},
            "extension": {"api_key":"SECRET_CANARY_TOKEN_HASH_0085"}
        },
        "account_id": "provider-internal-account",
        "debug": "SECRET_CANARY_TOKEN_HASH_0085"
    }"#;
    let upstream = spawn_status(StatusCode::BAD_REQUEST, provider_body, "application/json").await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(vec![connection("internal-account-charlie", upstream)]),
            false,
        )
        .unwrap();

    let response = app(state).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8_lossy(&body);

    assert!(!text.contains(CANARY), "{text}");
    assert!(!text.contains("provider-internal-account"), "{text}");
    assert!(!text.contains("internal-account-charlie"), "{text}");
    assert!(text.contains("bad request from provider"), "{text}");
    assert!(text.contains("invalid_request_error"), "{text}");
    assert!(text.contains("bad_input"), "{text}");
    assert!(text.contains("\"error_id\""), "{text}");
    let public: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let root = public.as_object().unwrap();
    assert_eq!(
        root.keys()
            .map(String::as_str)
            .collect::<std::collections::BTreeSet<_>>(),
        ["error", "error_id"].into_iter().collect()
    );
    let error = root["error"].as_object().unwrap();
    assert_eq!(
        error
            .keys()
            .map(String::as_str)
            .collect::<std::collections::BTreeSet<_>>(),
        ["code", "message", "param", "type"].into_iter().collect()
    );
    assert!(root["error_id"]
        .as_str()
        .is_some_and(|error_id| error_id.starts_with("apx-")));
    assert!(
        body.len() < 4096,
        "sanitized public error must stay bounded"
    );
}

#[tokio::test]
async fn non_json_provider_error_is_replaced_with_generic_bounded_error() {
    const CANARY: &str = "SECRET_CANARY_RAW_PROVIDER_BODY_0085";
    let upstream = spawn_status(
        StatusCode::BAD_REQUEST,
        "SECRET_CANARY_RAW_PROVIDER_BODY_0085",
        "text/plain",
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(vec![connection("internal-account-delta", upstream)]),
            false,
        )
        .unwrap();

    let response = app(state).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8_lossy(&body);

    assert!(!text.contains(CANARY), "{text}");
    assert!(text.contains("upstream provider request failed"), "{text}");
    assert!(text.contains("\"error_id\""), "{text}");
    let public: serde_json::Value = serde_json::from_slice(&body).unwrap();
    let root = public.as_object().unwrap();
    assert_eq!(
        root.keys()
            .map(String::as_str)
            .collect::<std::collections::BTreeSet<_>>(),
        ["error", "error_id"].into_iter().collect()
    );
    assert_eq!(
        root["error"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect::<std::collections::BTreeSet<_>>(),
        ["message", "type"].into_iter().collect()
    );
    assert!(body.len() < 2048);
}
