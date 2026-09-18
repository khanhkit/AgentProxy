use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

use agentproxy_control_protocol::snapshot::{
    ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::{app, AppState};
use agentproxy_providers::codex::adapter::{CodexAdapter, PrepareError};
use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    response::Response,
    routing::post,
    Router,
};
use http_body_util::BodyExt;
use serde_json::json;
use sha2::{Digest, Sha256};
use tokio::net::TcpListener;
use tower::ServiceExt;

fn account(base_url: String) -> CodexConnectionConfig {
    CodexConnectionConfig {
        id: "route-test".to_owned(),
        access_token: "provider-token".to_owned(),
        workspace_id: None,
        base_url,
        max_concurrent: Some(2),
        credential_version: 1,
    }
}

#[test]
fn adapter_allows_only_base_and_compact_responses_paths() {
    let account = account("https://example.invalid/backend-api/codex".to_owned());
    let body = json!({"model":"gpt-5.6-sol","input":[]});

    let base = CodexAdapter::prepare("/v1/responses", body.clone(), &account)
        .expect("base responses path");
    assert_eq!(
        base.url,
        "https://example.invalid/backend-api/codex/responses"
    );
    assert!(!base.compact);

    let compact = CodexAdapter::prepare("/v1/responses/compact", body.clone(), &account)
        .expect("compact responses path");
    assert_eq!(
        compact.url,
        "https://example.invalid/backend-api/codex/responses/compact"
    );
    assert!(compact.compact);

    for path in [
        "/v1/responses/future",
        "/v1/responses/compact/future",
        "/v1/responses/batches",
        "responses/unknown",
    ] {
        let error = CodexAdapter::prepare(path, body.clone(), &account)
            .err()
            .expect("unknown native suffix must fail closed");
        assert_eq!(error, PrepareError::UnsupportedEndpoint, "{path}");
    }
}

async fn spawn_counting_upstream(hits: Arc<AtomicUsize>) -> String {
    async fn responses(State(hits): State<Arc<AtomicUsize>>) -> Response {
        hits.fetch_add(1, Ordering::SeqCst);
        Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "text/event-stream")
            .body(Body::from(
                "event: response.created\ndata: {\"type\":\"response.created\"}\n\n",
            ))
            .unwrap()
    }

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(
            listener,
            Router::new()
                .route("/responses", post(responses))
                .route("/responses/{*rest}", post(responses))
                .with_state(hits),
        )
        .await
        .unwrap();
    });
    format!("http://{address}")
}

fn api_key(secret: &str) -> ApiKeyConfig {
    ApiKeyConfig {
        id: "route-client".to_owned(),
        key_hash: format!("{:x}", Sha256::digest(secret.as_bytes())),
        allowed_connections: vec![],
        allowed_endpoints: vec!["chat".to_owned()],
        unsupported_policy: false,
    }
}

#[tokio::test]
async fn unknown_native_suffix_is_rejected_without_upstream_attempt() {
    let hits = Arc::new(AtomicUsize::new(0));
    let base_url = spawn_counting_upstream(Arc::clone(&hits)).await;
    let state = AppState::new();
    state
        .install_snapshot(
            ConfigSnapshot {
                schema_version: SUPPORTED_SCHEMA_VERSION,
                source_id: "route-v1".to_owned(),
                generation: 1,
                api_keys: vec![api_key("client-secret")],
                codex_connections: vec![account(base_url)],
                codex_catalog_models: vec!["gpt-5.6-sol".to_owned()],
                codex_native_models: vec!["gpt-5.6-sol".to_owned()],
            },
            false,
        )
        .unwrap();

    let request = Request::builder()
        .method("POST")
        .uri("/v1/responses/future")
        .header("content-type", "application/json")
        .header("authorization", "Bearer client-secret")
        .body(Body::from(r#"{"model":"gpt-5.6-sol","input":[]}"#))
        .unwrap();

    let response = app(state).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert!(
        String::from_utf8_lossy(&body).contains("unsupported Codex request"),
        "rejection must be deterministic"
    );
    assert_eq!(
        hits.load(Ordering::SeqCst),
        0,
        "unknown native suffix must not reach provider upstream"
    );
}
