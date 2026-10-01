use std::{convert::Infallible, time::Duration};

use agentproxy_control_protocol::snapshot::{
    ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::{
    app,
    lifecycle::{AttemptLifecycleOutcome, RequestOutcome},
    AppState,
};
use async_stream::stream;
use axum::{
    body::{Body, Bytes},
    http::{Request, StatusCode},
    response::Response,
    routing::post,
    Router,
};
use http_body_util::BodyExt;
use sha2::{Digest, Sha256};
use tokio::{net::TcpListener, time::sleep};
use tower::ServiceExt;

fn api_key(secret: &str) -> ApiKeyConfig {
    ApiKeyConfig {
        id: "lifecycle-client".to_owned(),
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
        source_id: "lifecycle-0084".to_owned(),
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

async fn spawn_sse(events: Vec<&'static [u8]>, tail_delay: Option<Duration>) -> String {
    let events = events
        .into_iter()
        .map(Bytes::from_static)
        .collect::<Vec<_>>();
    let app = Router::new().route(
        "/responses",
        post(move || {
            let events = events.clone();
            async move {
                let body = stream! {
                    for event in events {
                        yield Ok::<Bytes, Infallible>(event);
                        sleep(Duration::from_millis(10)).await;
                    }
                    if let Some(delay) = tail_delay {
                        sleep(delay).await;
                    }
                };
                Response::builder()
                    .status(StatusCode::OK)
                    .header("content-type", "text/event-stream")
                    .body(Body::from_stream(body))
                    .unwrap()
            }
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}")
}

async fn spawn_status(status: StatusCode) -> String {
    let app = Router::new().route(
        "/responses",
        post(move || async move {
            Response::builder()
                .status(status)
                .body(Body::from("retry"))
                .unwrap()
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}")
}

#[tokio::test]
async fn terminal_success_records_success_only_after_completed_event() {
    let upstream = spawn_sse(
        vec![
            b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n",
            b"event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\n\n",
        ],
        None,
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(snapshot(vec![connection("only", upstream)]), false)
        .unwrap();

    let response = app(state.clone()).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    response.into_body().collect().await.unwrap();

    let lifecycle = state.lifecycle_snapshot();
    assert_eq!(lifecycle.request_count(RequestOutcome::Success), 1);
    assert_eq!(
        lifecycle.attempt_count(AttemptLifecycleOutcome::SuccessTerminal),
        1
    );
    assert_eq!(lifecycle.request_count(RequestOutcome::Incomplete), 0);
}

#[tokio::test]
async fn terminal_provider_error_after_commit_is_failed_postcommit() {
    let upstream = spawn_sse(
        vec![
            b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n",
            b"event: response.failed\ndata: {\"type\":\"response.failed\",\"response\":{\"status\":\"failed\",\"error\":{\"code\":\"provider_policy_failure\"}}}\n\n",
        ],
        None,
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(snapshot(vec![connection("only", upstream)]), false)
        .unwrap();

    let response = app(state.clone()).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    response.into_body().collect().await.unwrap();

    let lifecycle = state.lifecycle_snapshot();
    assert_eq!(lifecycle.request_count(RequestOutcome::FailedPostcommit), 1);
    assert_eq!(
        lifecycle.attempt_count(AttemptLifecycleOutcome::PostcommitFailure),
        1
    );
    assert_eq!(lifecycle.request_count(RequestOutcome::Success), 0);
}

#[tokio::test]
async fn downstream_body_drop_is_cancelled_postcommit_and_health_neutral() {
    let upstream = spawn_sse(
        vec![b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n"],
        Some(Duration::from_secs(30)),
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(snapshot(vec![connection("only", upstream)]), false)
        .unwrap();

    let response = app(state.clone()).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let mut body = response.into_body();
    let first = body
        .frame()
        .await
        .expect("first body frame")
        .expect("first frame must be valid");
    assert!(String::from_utf8_lossy(&first.into_data().unwrap()).contains("response.created"));
    drop(body);
    sleep(Duration::from_millis(25)).await;

    let lifecycle = state.lifecycle_snapshot();
    assert_eq!(
        lifecycle.request_count(RequestOutcome::CancelledPostcommit),
        1
    );
    assert_eq!(
        lifecycle.attempt_count(AttemptLifecycleOutcome::DownstreamCancelled),
        1
    );
    assert!(
        state
            .select_codex_account_for_model(&[], &[], Some("gpt-5.6-sol"))
            .is_some(),
        "downstream cancellation must not penalize provider health"
    );
}

#[tokio::test]
async fn retryable_first_attempt_then_terminal_fallback_is_recovered_by_fallback() {
    let first = spawn_status(StatusCode::TOO_MANY_REQUESTS).await;
    let second = spawn_sse(
        vec![
            b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n",
            b"event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\n\n",
        ],
        None,
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(
            snapshot(vec![
                connection("first", first),
                connection("second", second),
            ]),
            false,
        )
        .unwrap();

    let response = app(state.clone()).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    response.into_body().collect().await.unwrap();

    let lifecycle = state.lifecycle_snapshot();
    assert_eq!(
        lifecycle.request_count(RequestOutcome::RecoveredByFallback),
        1
    );
    assert_eq!(
        lifecycle.attempt_count(AttemptLifecycleOutcome::RetryablePrecommitFailure),
        1
    );
    assert_eq!(
        lifecycle.attempt_count(AttemptLifecycleOutcome::SuccessTerminal),
        1
    );
}

#[tokio::test]
async fn eof_without_terminal_event_is_incomplete_and_provider_relevant() {
    let upstream = spawn_sse(
        vec![b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n"],
        None,
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(snapshot(vec![connection("only", upstream)]), false)
        .unwrap();

    let response = app(state.clone()).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    response.into_body().collect().await.unwrap();

    let lifecycle = state.lifecycle_snapshot();
    assert_eq!(lifecycle.request_count(RequestOutcome::Incomplete), 1);
    assert_eq!(
        lifecycle.attempt_count(AttemptLifecycleOutcome::PostcommitFailure),
        1
    );
    assert!(
        state
            .select_codex_account_for_model(&[], &[], Some("gpt-5.6-sol"))
            .is_none(),
        "provider-side incomplete EOF should affect transient health"
    );
}

#[tokio::test]
async fn forced_shutdown_after_commit_is_upstream_cancelled_not_provider_failure() {
    let upstream = spawn_sse(
        vec![b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n"],
        Some(Duration::from_secs(30)),
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(snapshot(vec![connection("only", upstream)]), false)
        .unwrap();

    let response = app(state.clone()).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let mut body = response.into_body();
    let first = body
        .frame()
        .await
        .expect("first body frame")
        .expect("first frame must be valid");
    assert!(String::from_utf8_lossy(&first.into_data().unwrap()).contains("response.created"));

    state.force_shutdown();
    let _ = body.collect().await;
    sleep(Duration::from_millis(20)).await;

    let lifecycle = state.lifecycle_snapshot();
    assert_eq!(lifecycle.request_count(RequestOutcome::Incomplete), 1);
    assert_eq!(
        lifecycle.attempt_count(AttemptLifecycleOutcome::UpstreamCancelled),
        1
    );
    assert!(
        state
            .select_codex_account_for_model(&[], &[], Some("gpt-5.6-sol"))
            .is_some(),
        "gateway-forced shutdown must not penalize provider health"
    );
}

#[tokio::test]
async fn fatal_first_event_is_failed_precommit_not_success() {
    let upstream = spawn_sse(
        vec![b"event: response.failed\ndata: {\"type\":\"response.failed\",\"response\":{\"status\":\"failed\",\"error\":{\"code\":\"provider_policy_failure\"}}}\n\n"],
        None,
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(snapshot(vec![connection("only", upstream)]), false)
        .unwrap();

    let response = app(state.clone()).oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    response.into_body().collect().await.unwrap();

    let lifecycle = state.lifecycle_snapshot();
    assert_eq!(lifecycle.request_count(RequestOutcome::FailedPrecommit), 1);
    assert_eq!(
        lifecycle.attempt_count(AttemptLifecycleOutcome::FatalPrecommitFailure),
        1
    );
    assert_eq!(lifecycle.request_count(RequestOutcome::Success), 0);
}
