use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

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

fn api_key(id: &str, secret: &str) -> ApiKeyConfig {
    ApiKeyConfig {
        id: id.to_owned(),
        key_hash: format!("{:x}", Sha256::digest(secret.as_bytes())),
        allowed_connections: vec![],
        allowed_endpoints: vec!["chat".to_owned()],
        unsupported_policy: false,
    }
}

fn connection(id: &str, base_url: String) -> CodexConnectionConfig {
    connection_version(id, base_url, 1)
}

fn connection_version(
    id: &str,
    base_url: String,
    credential_version: u64,
) -> CodexConnectionConfig {
    CodexConnectionConfig {
        id: id.to_owned(),
        access_token: format!("token-{id}-v{credential_version}"),
        workspace_id: None,
        base_url,
        max_concurrent: Some(2),
        credential_version,
    }
}

fn snapshot(
    generation: u64,
    keys: Vec<ApiKeyConfig>,
    connections: Vec<CodexConnectionConfig>,
) -> ConfigSnapshot {
    ConfigSnapshot {
        schema_version: SUPPORTED_SCHEMA_VERSION,
        source_id: "continuation-affinity-0106".to_owned(),
        generation,
        api_keys: keys,
        codex_connections: connections,
        codex_catalog_models: vec!["gpt-5.6-sol".to_owned()],
        codex_native_models: vec!["gpt-5.6-sol".to_owned()],
    }
}

fn request(secret: &str, body: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/v1/responses")
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {secret}"))
        .body(Body::from(body.to_owned()))
        .unwrap()
}

async fn spawn_completed(
    label: &'static str,
    response_id: &'static str,
    hits: Arc<AtomicUsize>,
) -> String {
    let app = Router::new().route(
        "/responses",
        post(move || {
            let hits = Arc::clone(&hits);
            async move {
                hits.fetch_add(1, Ordering::SeqCst);
                let body = format!(
                    "event: response.created\ndata: {{\"type\":\"response.created\",\"source\":\"{label}\",\"response\":{{\"id\":\"{response_id}\"}}}}\n\n                     event: response.completed\ndata: {{\"type\":\"response.completed\",\"source\":\"{label}\",\"response\":{{\"id\":\"{response_id}\",\"status\":\"completed\"}}}}\n\n"
                );
                Response::builder()
                    .status(StatusCode::OK)
                    .header("content-type", "text/event-stream")
                    .body(Body::from(body))
                    .unwrap()
            }
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}")
}

async fn spawn_incomplete(response_id: &'static str, hits: Arc<AtomicUsize>) -> String {
    let app = Router::new().route(
        "/responses",
        post(move || {
            let hits = Arc::clone(&hits);
            async move {
                hits.fetch_add(1, Ordering::SeqCst);
                let body = format!(
                    "event: response.created\ndata: {{\"type\":\"response.created\",\"response\":{{\"id\":\"{response_id}\"}}}}\n\n"
                );
                Response::builder()
                    .status(StatusCode::OK)
                    .header("content-type", "text/event-stream")
                    .body(Body::from(body))
                    .unwrap()
            }
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}")
}

async fn spawn_retryable_failure(response_id: &'static str, hits: Arc<AtomicUsize>) -> String {
    let app = Router::new().route(
        "/responses",
        post(move || {
            let hits = Arc::clone(&hits);
            async move {
                hits.fetch_add(1, Ordering::SeqCst);
                let body = format!(
                    "event: response.failed\ndata: {{\"type\":\"response.failed\",\"response\":{{\"id\":\"{response_id}\",\"status\":\"failed\",\"error\":{{\"code\":\"rate_limit_exceeded\",\"message\":\"retry\"}}}}}}\n\n"
                );
                Response::builder()
                    .status(StatusCode::OK)
                    .header("content-type", "text/event-stream")
                    .body(Body::from(body))
                    .unwrap()
            }
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}")
}

async fn text(response: Response) -> String {
    String::from_utf8_lossy(&response.into_body().collect().await.unwrap().to_bytes()).into_owned()
}

fn response_id_from_text(body: &str) -> &'static str {
    if body.contains("resp-a") {
        "resp-a"
    } else if body.contains("resp-b") {
        "resp-b"
    } else {
        panic!("missing known response id: {body}");
    }
}

#[tokio::test]
async fn successful_response_id_replays_on_same_producing_auth() {
    let hits_a = Arc::new(AtomicUsize::new(0));
    let hits_b = Arc::new(AtomicUsize::new(0));
    let a = spawn_completed("a", "resp-a", Arc::clone(&hits_a)).await;
    let b = spawn_completed("b", "resp-b", Arc::clone(&hits_b)).await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(
                1,
                vec![api_key("caller-a", "secret-a")],
                vec![connection("account-a", a), connection("account-b", b)],
            ),
            false,
        )
        .unwrap();

    let first = app(state.clone())
        .oneshot(request("secret-a", r#"{"model":"gpt-5.6-sol","input":[]}"#))
        .await
        .unwrap();
    let first_body = text(first).await;
    let response_id = response_id_from_text(&first_body);
    let before_a = hits_a.load(Ordering::SeqCst);
    let before_b = hits_b.load(Ordering::SeqCst);

    let continuation = app(state)
        .oneshot(request(
            "secret-a",
            &format!(
                r#"{{"model":"gpt-5.6-sol","previous_response_id":"{response_id}","input":[]}}"#
            ),
        ))
        .await
        .unwrap();
    assert_eq!(continuation.status(), StatusCode::OK);
    let continuation_body = text(continuation).await;

    if response_id == "resp-a" {
        assert!(continuation_body.contains(r#""source":"a""#));
        assert_eq!(hits_a.load(Ordering::SeqCst), before_a + 1);
        assert_eq!(hits_b.load(Ordering::SeqCst), before_b);
    } else {
        assert!(continuation_body.contains(r#""source":"b""#));
        assert_eq!(hits_b.load(Ordering::SeqCst), before_b + 1);
        assert_eq!(hits_a.load(Ordering::SeqCst), before_a);
    }
}

#[tokio::test]
async fn caller_scope_prevents_cross_api_key_reuse() {
    let hits = Arc::new(AtomicUsize::new(0));
    let upstream = spawn_completed("a", "resp-shared", Arc::clone(&hits)).await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(
                1,
                vec![
                    api_key("caller-a", "secret-a"),
                    api_key("caller-b", "secret-b"),
                ],
                vec![connection("account-a", upstream)],
            ),
            false,
        )
        .unwrap();

    let first = app(state.clone())
        .oneshot(request("secret-a", r#"{"model":"gpt-5.6-sol","input":[]}"#))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    text(first).await;
    let before = hits.load(Ordering::SeqCst);

    let cross_caller = app(state)
        .oneshot(request(
            "secret-b",
            r#"{"model":"gpt-5.6-sol","previous_response_id":"resp-shared","input":[]}"#,
        ))
        .await
        .unwrap();
    assert_eq!(cross_caller.status(), StatusCode::CONFLICT);
    assert_eq!(hits.load(Ordering::SeqCst), before);
}

#[tokio::test]
async fn unknown_previous_response_id_fails_before_upstream_dispatch() {
    let hits = Arc::new(AtomicUsize::new(0));
    let upstream = spawn_completed("a", "resp-a", Arc::clone(&hits)).await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(
                1,
                vec![api_key("caller-a", "secret-a")],
                vec![connection("account-a", upstream)],
            ),
            false,
        )
        .unwrap();

    let response = app(state)
        .oneshot(request(
            "secret-a",
            r#"{"model":"gpt-5.6-sol","previous_response_id":"resp-unknown","input":[]}"#,
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let public_body = text(response).await;
    assert!(
        !public_body.contains("resp-unknown"),
        "opaque continuation ID must not be reflected: {public_body}"
    );
    assert_eq!(hits.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn mapped_auth_removal_fails_instead_of_falling_back() {
    let hits_a = Arc::new(AtomicUsize::new(0));
    let hits_b = Arc::new(AtomicUsize::new(0));
    let a = spawn_completed("a", "resp-a", Arc::clone(&hits_a)).await;
    let b = spawn_completed("b", "resp-b", Arc::clone(&hits_b)).await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(
                1,
                vec![api_key("caller-a", "secret-a")],
                vec![connection("account-a", a)],
            ),
            false,
        )
        .unwrap();

    let first = app(state.clone())
        .oneshot(request("secret-a", r#"{"model":"gpt-5.6-sol","input":[]}"#))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    let first_body = text(first).await;
    assert!(first_body.contains("resp-a"));

    state
        .install_snapshot(
            snapshot(
                2,
                vec![api_key("caller-a", "secret-a")],
                vec![connection("account-b", b)],
            ),
            false,
        )
        .unwrap();

    let continuation = app(state)
        .oneshot(request(
            "secret-a",
            r#"{"model":"gpt-5.6-sol","previous_response_id":"resp-a","input":[]}"#,
        ))
        .await
        .unwrap();
    assert_eq!(continuation.status(), StatusCode::CONFLICT);
    assert_eq!(hits_b.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn incomplete_response_id_is_never_registered() {
    let hits = Arc::new(AtomicUsize::new(0));
    let upstream = spawn_incomplete("resp-incomplete", Arc::clone(&hits)).await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(
                1,
                vec![api_key("caller-a", "secret-a")],
                vec![connection("account-a", upstream)],
            ),
            false,
        )
        .unwrap();

    let first = app(state.clone())
        .oneshot(request("secret-a", r#"{"model":"gpt-5.6-sol","input":[]}"#))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    let first_body = text(first).await;
    assert!(first_body.contains("resp-incomplete"));
    let before = hits.load(Ordering::SeqCst);

    let continuation = app(state)
        .oneshot(request(
            "secret-a",
            r#"{"model":"gpt-5.6-sol","previous_response_id":"resp-incomplete","input":[]}"#,
        ))
        .await
        .unwrap();
    assert_eq!(continuation.status(), StatusCode::CONFLICT);
    assert_eq!(hits.load(Ordering::SeqCst), before);
}

#[tokio::test]
async fn by_value_encrypted_reasoning_does_not_require_affinity() {
    let hits = Arc::new(AtomicUsize::new(0));
    let upstream = spawn_completed("a", "resp-stateless", Arc::clone(&hits)).await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(
                1,
                vec![api_key("caller-a", "secret-a")],
                vec![connection("account-a", upstream)],
            ),
            false,
        )
        .unwrap();

    let response = app(state)
        .oneshot(request(
            "secret-a",
            r#"{"model":"gpt-5.6-sol","input":[{"type":"reasoning","encrypted_content":"opaque-by-value"}]}"#,
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(text(response).await.contains("resp-stateless"));
    assert_eq!(hits.load(Ordering::SeqCst), 1);
}

// TC-CONT-AFF-003
#[tokio::test]
async fn credential_version_change_invalidates_existing_affinity() {
    let hits = Arc::new(AtomicUsize::new(0));
    let upstream = spawn_completed("a", "resp-versioned", Arc::clone(&hits)).await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(
                1,
                vec![api_key("caller-a", "secret-a")],
                vec![connection_version("account-a", upstream.clone(), 1)],
            ),
            false,
        )
        .unwrap();

    let first = app(state.clone())
        .oneshot(request("secret-a", r#"{"model":"gpt-5.6-sol","input":[]}"#))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    assert!(text(first).await.contains("resp-versioned"));
    let before = hits.load(Ordering::SeqCst);

    state
        .install_snapshot(
            snapshot(
                2,
                vec![api_key("caller-a", "secret-a")],
                vec![connection_version("account-a", upstream, 2)],
            ),
            false,
        )
        .unwrap();

    let continuation = app(state)
        .oneshot(request(
            "secret-a",
            r#"{"model":"gpt-5.6-sol","previous_response_id":"resp-versioned","input":[]}"#,
        ))
        .await
        .unwrap();
    assert_eq!(continuation.status(), StatusCode::CONFLICT);
    assert_eq!(
        hits.load(Ordering::SeqCst),
        before,
        "credential-version mismatch must fail before upstream dispatch"
    );
}

// TC-CONT-AFF-004
#[tokio::test]
async fn retry_loser_id_is_not_registered_but_winning_id_is() {
    let loser_hits = Arc::new(AtomicUsize::new(0));
    let winner_hits = Arc::new(AtomicUsize::new(0));
    let loser = spawn_retryable_failure("resp-loser", Arc::clone(&loser_hits)).await;
    let winner = spawn_completed("winner", "resp-winner", Arc::clone(&winner_hits)).await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(
                1,
                vec![api_key("caller-a", "secret-a")],
                vec![
                    connection("account-loser", loser),
                    connection("account-winner", winner),
                ],
            ),
            false,
        )
        .unwrap();

    let first = app(state.clone())
        .oneshot(request("secret-a", r#"{"model":"gpt-5.6-sol","input":[]}"#))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    let first_body = text(first).await;
    assert!(first_body.contains("resp-winner"), "{first_body}");
    assert_eq!(loser_hits.load(Ordering::SeqCst), 1);
    assert_eq!(winner_hits.load(Ordering::SeqCst), 1);

    let before_loser = loser_hits.load(Ordering::SeqCst);
    let before_winner = winner_hits.load(Ordering::SeqCst);

    let losing_continuation = app(state.clone())
        .oneshot(request(
            "secret-a",
            r#"{"model":"gpt-5.6-sol","previous_response_id":"resp-loser","input":[]}"#,
        ))
        .await
        .unwrap();
    assert_eq!(losing_continuation.status(), StatusCode::CONFLICT);
    assert_eq!(loser_hits.load(Ordering::SeqCst), before_loser);
    assert_eq!(winner_hits.load(Ordering::SeqCst), before_winner);

    let winning_continuation = app(state)
        .oneshot(request(
            "secret-a",
            r#"{"model":"gpt-5.6-sol","previous_response_id":"resp-winner","input":[]}"#,
        ))
        .await
        .unwrap();
    assert_eq!(winning_continuation.status(), StatusCode::OK);
    let winning_body = text(winning_continuation).await;
    assert!(
        winning_body.contains(r#""source":"winner""#),
        "{winning_body}"
    );
    assert_eq!(loser_hits.load(Ordering::SeqCst), before_loser);
    assert_eq!(winner_hits.load(Ordering::SeqCst), before_winner + 1);
}

// TC-CONT-AFF-005
#[tokio::test]
async fn identical_api_key_display_ids_do_not_merge_principal_scope() {
    let hits = Arc::new(AtomicUsize::new(0));
    let upstream = spawn_completed("a", "resp-principal", Arc::clone(&hits)).await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(
                1,
                vec![
                    api_key("same-display-id", "secret-a"),
                    api_key("same-display-id", "secret-b"),
                ],
                vec![connection("account-a", upstream)],
            ),
            false,
        )
        .unwrap();

    let first = app(state.clone())
        .oneshot(request("secret-a", r#"{"model":"gpt-5.6-sol","input":[]}"#))
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    assert!(text(first).await.contains("resp-principal"));
    let before = hits.load(Ordering::SeqCst);

    let cross_principal = app(state)
        .oneshot(request(
            "secret-b",
            r#"{"model":"gpt-5.6-sol","previous_response_id":"resp-principal","input":[]}"#,
        ))
        .await
        .unwrap();
    assert_eq!(cross_principal.status(), StatusCode::CONFLICT);
    assert_eq!(
        hits.load(Ordering::SeqCst),
        before,
        "same display ID must not collapse distinct authenticated principals"
    );
}

// TC-CONT-AFF-008
#[tokio::test]
async fn malformed_empty_and_oversized_previous_response_ids_fail_before_dispatch() {
    let hits = Arc::new(AtomicUsize::new(0));
    let upstream = spawn_completed("a", "resp-a", Arc::clone(&hits)).await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(
                1,
                vec![api_key("caller-a", "secret-a")],
                vec![connection("account-a", upstream)],
            ),
            false,
        )
        .unwrap();

    let malformed = [
        r#"{"model":"gpt-5.6-sol","previous_response_id":42,"input":[]}"#.to_owned(),
        r#"{"model":"gpt-5.6-sol","previous_response_id":"","input":[]}"#.to_owned(),
        format!(
            r#"{{"model":"gpt-5.6-sol","previous_response_id":"{}","input":[]}}"#,
            "x".repeat(1025)
        ),
    ];

    for body in malformed {
        let response = app(state.clone())
            .oneshot(request("secret-a", &body))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
    assert_eq!(
        hits.load(Ordering::SeqCst),
        0,
        "invalid continuation identifiers must be rejected before dispatch"
    );
}
