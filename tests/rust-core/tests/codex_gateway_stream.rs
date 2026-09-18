use std::{convert::Infallible, time::Duration};

use agentproxy_control_protocol::snapshot::{
    ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::{app, AppState};
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
use tokio::{
    net::TcpListener,
    time::{sleep, timeout},
};
use tower::ServiceExt;

fn api_key(secret: &str, allowed_connections: Vec<String>) -> ApiKeyConfig {
    ApiKeyConfig {
        id: "test-client".to_owned(),
        key_hash: format!("{:x}", Sha256::digest(secret.as_bytes())),
        allowed_connections,
        allowed_endpoints: vec!["chat".to_owned()],
        unsupported_policy: false,
    }
}

async fn spawn_single_event_codex(event: &'static [u8]) -> String {
    let event = Bytes::from_static(event);
    let app = Router::new().route(
        "/responses",
        post(move || {
            let event = event.clone();
            async move {
                Response::builder()
                    .status(StatusCode::OK)
                    .header("content-type", "text/event-stream")
                    .body(Body::from(event))
                    .unwrap()
            }
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    format!("http://{address}")
}

async fn spawn_mock_codex() -> String {
    async fn responses() -> Response {
        let body = stream! {
            yield Ok::<Bytes, Infallible>(Bytes::from_static(
                b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n"
            ));
            sleep(Duration::from_millis(400)).await;
            yield Ok::<Bytes, Infallible>(Bytes::from_static(
                b"event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"hello\"}\n\n"
            ));
        };
        Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "text/event-stream")
            .body(Body::from_stream(body))
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

#[tokio::test]
async fn native_codex_commits_on_response_created_without_waiting_for_output_text() {
    let base_url = spawn_mock_codex().await;
    let state = AppState::new();
    state
        .install_snapshot(
            ConfigSnapshot {
                schema_version: SUPPORTED_SCHEMA_VERSION,
                source_id: "node-a".to_owned(),
                generation: 1,
                api_keys: vec![api_key("client-secret", vec![])],
                codex_connections: vec![CodexConnectionConfig {
                    id: "mock".to_owned(),
                    access_token: "token".to_owned(),
                    workspace_id: None,
                    base_url,
                    max_concurrent: Some(2),
                    credential_version: 1,
                }],
                codex_catalog_models: vec!["gpt-5.6-sol-high".to_owned()],
                codex_native_models: vec!["gpt-5.6-sol-high".to_owned()],
            },
            false,
        )
        .unwrap();

    let request = Request::builder()
        .method("POST")
        .uri("/v1/responses")
        .header("content-type", "application/json")
        .header("authorization", "Bearer client-secret")
        .body(Body::from(r#"{"model":"gpt-5.6-sol-high","input":[]}"#))
        .unwrap();

    let response = timeout(Duration::from_millis(150), app(state).oneshot(request))
        .await
        .expect("gateway must commit before delayed output_text")
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers().get("x-accel-buffering").unwrap(), "no");

    let mut body = response.into_body();
    let first = timeout(Duration::from_millis(100), body.frame())
        .await
        .expect("first downstream frame")
        .expect("body frame")
        .expect("stream frame");
    let first = first.into_data().expect("data frame");
    assert!(String::from_utf8_lossy(&first).contains("response.created"));
}

#[tokio::test]
async fn transient_sse_error_retries_on_next_account_before_commit() {
    let overloaded = spawn_single_event_codex(
        b"event: error\ndata: {\"type\":\"error\",\"code\":\"server_is_overloaded\"}\n\n",
    )
    .await;
    let healthy = spawn_single_event_codex(
        b"event: response.created\ndata: {\"type\":\"response.created\",\"source\":\"fallback\"}\n\n",
    )
    .await;

    let state = AppState::new();
    state
        .install_snapshot(
            ConfigSnapshot {
                schema_version: SUPPORTED_SCHEMA_VERSION,
                source_id: "node-a".to_owned(),
                generation: 1,
                api_keys: vec![api_key("client-secret", vec![])],
                codex_connections: vec![
                    CodexConnectionConfig {
                        id: "first".to_owned(),
                        access_token: "token-a".to_owned(),
                        workspace_id: None,
                        base_url: overloaded,
                        max_concurrent: Some(2),
                        credential_version: 1,
                    },
                    CodexConnectionConfig {
                        id: "second".to_owned(),
                        access_token: "token-b".to_owned(),
                        workspace_id: None,
                        base_url: healthy,
                        max_concurrent: Some(2),
                        credential_version: 1,
                    },
                ],
                codex_catalog_models: vec!["gpt-5.6-sol-high".to_owned()],
                codex_native_models: vec!["gpt-5.6-sol-high".to_owned()],
            },
            false,
        )
        .unwrap();

    let request = Request::builder()
        .method("POST")
        .uri("/v1/responses")
        .header("content-type", "application/json")
        .header("authorization", "Bearer client-secret")
        .body(Body::from(r#"{"model":"gpt-5.6-sol-high","input":[]}"#))
        .unwrap();

    let response = timeout(Duration::from_millis(250), app(state).oneshot(request))
        .await
        .expect("fallback should complete before timeout")
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8_lossy(&bytes);
    assert!(text.contains("response.created"));
    assert!(text.contains("fallback"));
    assert!(!text.contains("server_is_overloaded"));
}

fn single_account_snapshot(base_url: String, key: ApiKeyConfig) -> ConfigSnapshot {
    ConfigSnapshot {
        schema_version: SUPPORTED_SCHEMA_VERSION,
        source_id: "node-auth".to_owned(),
        generation: 1,
        api_keys: vec![key],
        codex_connections: vec![CodexConnectionConfig {
            id: "only".to_owned(),
            access_token: "token-only".to_owned(),
            workspace_id: None,
            base_url,
            max_concurrent: Some(2),
            credential_version: 1,
        }],
        codex_catalog_models: vec!["gpt-5.6-sol-high".to_owned()],
        codex_native_models: vec!["gpt-5.6-sol-high".to_owned()],
    }
}

#[tokio::test]
async fn missing_or_invalid_client_key_is_rejected_before_upstream() {
    let upstream = spawn_single_event_codex(
        b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n",
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(
            single_account_snapshot(upstream, api_key("correct-secret", vec![])),
            false,
        )
        .unwrap();

    for authorization in [None, Some("Bearer wrong-secret")] {
        let mut builder = Request::builder()
            .method("POST")
            .uri("/v1/responses")
            .header("content-type", "application/json");
        if let Some(value) = authorization {
            builder = builder.header("authorization", value);
        }
        let request = builder
            .body(Body::from(r#"{"model":"gpt-5.6-sol-high","input":[]}"#))
            .unwrap();
        let response = app(state.clone()).oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}

#[tokio::test]
async fn unsupported_client_key_policy_fails_closed() {
    let upstream = spawn_single_event_codex(
        b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n",
    )
    .await;
    let state = AppState::new();
    let mut key = api_key("complex-secret", vec![]);
    key.unsupported_policy = true;
    state
        .install_snapshot(single_account_snapshot(upstream, key), false)
        .unwrap();

    let request = Request::builder()
        .method("POST")
        .uri("/v1/responses")
        .header("content-type", "application/json")
        .header("authorization", "Bearer complex-secret")
        .body(Body::from(r#"{"model":"gpt-5.6-sol-high","input":[]}"#))
        .unwrap();
    let response = app(state).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn allowed_connections_are_enforced_by_http_handler() {
    let first = spawn_single_event_codex(
        b"event: response.created\ndata: {\"type\":\"response.created\",\"source\":\"first\"}\n\n",
    )
    .await;
    let second = spawn_single_event_codex(
        b"event: response.created\ndata: {\"type\":\"response.created\",\"source\":\"second\"}\n\n",
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(
            ConfigSnapshot {
                schema_version: SUPPORTED_SCHEMA_VERSION,
                source_id: "node-allowlist".to_owned(),
                generation: 1,
                api_keys: vec![api_key("restricted-secret", vec!["second".to_owned()])],
                codex_connections: vec![
                    CodexConnectionConfig {
                        id: "first".to_owned(),
                        access_token: "token-first".to_owned(),
                        workspace_id: None,
                        base_url: first,
                        max_concurrent: Some(2),
                        credential_version: 1,
                    },
                    CodexConnectionConfig {
                        id: "second".to_owned(),
                        access_token: "token-second".to_owned(),
                        workspace_id: None,
                        base_url: second,
                        max_concurrent: Some(2),
                        credential_version: 1,
                    },
                ],
                codex_catalog_models: vec!["gpt-5.6-sol-high".to_owned()],
                codex_native_models: vec!["gpt-5.6-sol-high".to_owned()],
            },
            false,
        )
        .unwrap();

    let request = Request::builder()
        .method("POST")
        .uri("/v1/responses")
        .header("content-type", "application/json")
        .header("authorization", "Bearer restricted-secret")
        .body(Body::from(r#"{"model":"gpt-5.6-sol-high","input":[]}"#))
        .unwrap();
    let response = app(state).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8_lossy(&bytes);
    assert!(text.contains("second"));
    assert!(!text.contains("first"));
}

async fn spawn_legacy_responses_marker() -> String {
    async fn legacy() -> Response {
        Response::builder()
            .status(StatusCode::ACCEPTED)
            .header("content-type", "application/json")
            .header("x-agentproxy-route", "legacy-next")
            .body(Body::from(r#"{"source":"legacy-next"}"#))
            .unwrap()
    }

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, Router::new().route("/v1/responses", post(legacy)))
            .await
            .unwrap();
    });
    format!("http://{address}")
}

#[tokio::test]
async fn non_codex_model_falls_back_to_legacy_next_before_native_auth() {
    let codex = spawn_single_event_codex(
        b"event: response.created\ndata: {\"type\":\"response.created\",\"source\":\"codex\"}\n\n",
    )
    .await;
    let legacy = spawn_legacy_responses_marker().await;
    let state = AppState::new_with_legacy_base_url(legacy);
    state
        .install_snapshot(
            ConfigSnapshot {
                schema_version: SUPPORTED_SCHEMA_VERSION,
                source_id: "node-routing".to_owned(),
                generation: 1,
                api_keys: vec![api_key("client-secret", vec![])],
                codex_connections: vec![CodexConnectionConfig {
                    id: "codex".to_owned(),
                    access_token: "token-codex".to_owned(),
                    workspace_id: None,
                    base_url: codex,
                    max_concurrent: Some(2),
                    credential_version: 1,
                }],
                codex_catalog_models: vec!["gpt-5.6-sol-high".to_owned()],
                codex_native_models: vec!["gpt-5.6-sol-high".to_owned()],
            },
            false,
        )
        .unwrap();

    let request = Request::builder()
        .method("POST")
        .uri("/v1/responses")
        .header("content-type", "application/json")
        .body(Body::from(r#"{"model":"openai/gpt-4.1","input":[]}"#))
        .unwrap();
    let response = app(state).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::ACCEPTED);
    assert_eq!(
        response.headers().get("x-agentproxy-route").unwrap(),
        "legacy-next"
    );
}

async fn spawn_model_echo_codex() -> String {
    async fn responses(
        axum::extract::Json(body): axum::extract::Json<serde_json::Value>,
    ) -> Response {
        let model = body
            .get("model")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("missing");
        let event = format!(
            "event: response.created\ndata: {{\"type\":\"response.created\",\"model\":{}}}\n\n",
            serde_json::to_string(model).unwrap()
        );
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

#[tokio::test]
async fn explicit_codex_prefix_is_stripped_before_upstream() {
    let upstream = spawn_model_echo_codex().await;
    let state = AppState::new();
    state
        .install_snapshot(
            ConfigSnapshot {
                schema_version: SUPPORTED_SCHEMA_VERSION,
                source_id: "node-prefix".to_owned(),
                generation: 1,
                api_keys: vec![api_key("client-secret", vec![])],
                codex_connections: vec![CodexConnectionConfig {
                    id: "codex".to_owned(),
                    access_token: "token-codex".to_owned(),
                    workspace_id: None,
                    base_url: upstream,
                    max_concurrent: Some(2),
                    credential_version: 1,
                }],
                codex_catalog_models: vec!["gpt-5.6-sol-high".to_owned()],
                codex_native_models: vec![],
            },
            false,
        )
        .unwrap();

    let request = Request::builder()
        .method("POST")
        .uri("/v1/responses")
        .header("content-type", "application/json")
        .header("authorization", "Bearer client-secret")
        .body(Body::from(
            r#"{"model":"codex/gpt-5.6-sol-high","input":[]}"#,
        ))
        .unwrap();
    let response = app(state).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8_lossy(&bytes);
    assert!(text.contains("\"model\":\"gpt-5.6-sol\""));
    assert!(!text.contains("codex/gpt-5.6-sol-high"));
}

fn two_account_snapshot(first: String, second: String) -> ConfigSnapshot {
    ConfigSnapshot {
        schema_version: SUPPORTED_SCHEMA_VERSION,
        source_id: "node-semantic-sse".to_owned(),
        generation: 1,
        api_keys: vec![api_key("client-secret", vec![])],
        codex_connections: vec![
            CodexConnectionConfig {
                id: "first".to_owned(),
                access_token: "token-first".to_owned(),
                workspace_id: None,
                base_url: first,
                max_concurrent: Some(2),
                credential_version: 1,
            },
            CodexConnectionConfig {
                id: "second".to_owned(),
                access_token: "token-second".to_owned(),
                workspace_id: None,
                base_url: second,
                max_concurrent: Some(2),
                credential_version: 1,
            },
        ],
        codex_catalog_models: vec!["gpt-5.6-sol-high".to_owned()],
        codex_native_models: vec!["gpt-5.6-sol-high".to_owned()],
    }
}

fn native_codex_request() -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/v1/responses")
        .header("content-type", "application/json")
        .header("authorization", "Bearer client-secret")
        .body(Body::from(r#"{"model":"gpt-5.6-sol-high","input":[]}"#))
        .unwrap()
}

#[tokio::test]
async fn benign_output_text_with_error_words_does_not_trigger_failover() {
    let upstream = spawn_single_event_codex(
        b"event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"server_is_overloaded is user-visible text\"}\n\n",
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(
            single_account_snapshot(upstream, api_key("client-secret", vec![])),
            false,
        )
        .unwrap();

    let response = app(state).oneshot(native_codex_request()).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    assert!(String::from_utf8_lossy(&bytes).contains("server_is_overloaded"));
}

#[tokio::test]
async fn structured_rate_limit_inside_http_200_retries_before_commit() {
    let rate_limited = spawn_single_event_codex(
        b"event: response.failed\ndata: {\"type\":\"response.failed\",\"response\":{\"status\":\"failed\",\"error\":{\"code\":\"rate_limit_exceeded\",\"message\":\"quota exhausted\"}}}\n\n",
    )
    .await;
    let healthy = spawn_single_event_codex(
        b"event: response.created\ndata: {\"type\":\"response.created\",\"source\":\"fallback\"}\n\n",
    )
    .await;
    let state = AppState::new();
    state
        .install_snapshot(two_account_snapshot(rate_limited, healthy), false)
        .unwrap();

    let response = app(state).oneshot(native_codex_request()).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let text = String::from_utf8_lossy(&bytes);
    assert!(text.contains("response.created"));
    assert!(text.contains("fallback"));
    assert!(!text.contains("rate_limit_exceeded"));
}
