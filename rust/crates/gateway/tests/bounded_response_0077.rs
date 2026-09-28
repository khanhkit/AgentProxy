use std::cmp::min;

use agentproxy_control_protocol::snapshot::{
    ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::{app, sync_snapshot_once, AppState};
use reqwest::StatusCode;
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    task::JoinHandle,
};

const TEST_KEY: &str = "ap0077-kittest-key";
const SNAPSHOT_LIMIT: usize = 16 * 1024 * 1024;
const COMPACT_LIMIT: usize = 64 * 1024 * 1024;
const ERROR_LIMIT: usize = 1024 * 1024;

enum FixtureBody {
    Empty,
    Fixed(Vec<u8>),
    Chunked {
        total_bytes: usize,
        chunk_bytes: usize,
    },
}

async fn spawn_raw_upstream(
    status_line: &'static str,
    headers: Vec<(String, String)>,
    body: FixtureBody,
) -> (String, JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind AP-0077 upstream fixture");
    let addr = listener
        .local_addr()
        .expect("read AP-0077 upstream fixture address");

    let server = tokio::spawn(async move {
        let (mut socket, _) = listener
            .accept()
            .await
            .expect("accept AP-0077 upstream request");
        let mut request = vec![0u8; 16 * 1024];
        let _ = socket.read(&mut request).await;

        let mut head = format!("HTTP/1.1 {status_line}\r\n");
        for (name, value) in headers {
            head.push_str(&format!("{name}: {value}\r\n"));
        }
        head.push_str("Connection: close\r\n\r\n");
        socket
            .write_all(head.as_bytes())
            .await
            .expect("write AP-0077 upstream headers");

        match body {
            FixtureBody::Empty => {}
            FixtureBody::Fixed(bytes) => {
                socket
                    .write_all(&bytes)
                    .await
                    .expect("write AP-0077 fixed body");
            }
            FixtureBody::Chunked {
                total_bytes,
                chunk_bytes,
            } => {
                let chunk = vec![b'x'; chunk_bytes];
                let mut remaining = total_bytes;
                while remaining > 0 {
                    let size = min(remaining, chunk.len());
                    socket
                        .write_all(format!("{size:X}\r\n").as_bytes())
                        .await
                        .expect("write AP-0077 chunk prefix");
                    socket
                        .write_all(&chunk[..size])
                        .await
                        .expect("write AP-0077 chunk body");
                    socket
                        .write_all(b"\r\n")
                        .await
                        .expect("write AP-0077 chunk suffix");
                    remaining -= size;
                }
                socket
                    .write_all(b"0\r\n\r\n")
                    .await
                    .expect("write AP-0077 terminal chunk");
            }
        }
    });

    (format!("http://{addr}"), server)
}

fn install_native_state(base_url: &str) -> AppState {
    let state = AppState::new();
    let mut snapshot = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 1);
    snapshot.codex_connections.push(CodexConnectionConfig {
        id: "ap0077-account".to_owned(),
        access_token: "upstream-token".to_owned(),
        workspace_id: None,
        base_url: base_url.to_owned(),
        max_concurrent: Some(1),
        credential_version: 1,
    });
    snapshot.api_keys.push(ApiKeyConfig {
        id: "ap0077-key".to_owned(),
        key_hash: format!("{:x}", Sha256::digest(TEST_KEY.as_bytes())),
        allowed_connections: vec!["ap0077-account".to_owned()],
        allowed_endpoints: vec!["chat".to_owned()],
        unsupported_policy: false,
    });
    snapshot.codex_native_models.push("gpt-test".to_owned());
    snapshot.codex_catalog_models.push("gpt-test".to_owned());
    state
        .install_snapshot(snapshot, true)
        .expect("install AP-0077 native state");
    state
}

async fn spawn_gateway(state: AppState) -> (String, JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind AP-0077 gateway fixture");
    let addr = listener
        .local_addr()
        .expect("read AP-0077 gateway fixture address");
    let server = tokio::spawn(async move {
        axum::serve(listener, app(state))
            .await
            .expect("AP-0077 gateway fixture should stay available");
    });
    (format!("http://{addr}"), server)
}

#[tokio::test]
async fn snapshot_declared_oversize_is_rejected_by_snapshot_cap() {
    let (base_url, upstream) = spawn_raw_upstream(
        "200 OK",
        vec![
            ("Content-Type".into(), "application/json".into()),
            ("Content-Length".into(), (SNAPSHOT_LIMIT + 1).to_string()),
        ],
        FixtureBody::Empty,
    )
    .await;

    let state = AppState::new();
    let client = reqwest::Client::new();
    let outcome = sync_snapshot_once(
        &state,
        &client,
        &format!("{base_url}/snapshot"),
        "ap0077-internal-token",
    )
    .await;
    upstream.await.expect("snapshot fixture should finish");

    let error = outcome.expect_err("oversized declared snapshot must be rejected");
    assert!(
        error.to_string().contains("16 MiB"),
        "expected explicit snapshot byte-cap error, got {error}"
    );
}

#[tokio::test]
async fn compact_declared_oversize_is_rejected_by_compact_cap() {
    let (upstream_url, upstream) = spawn_raw_upstream(
        "200 OK",
        vec![
            ("Content-Type".into(), "application/json".into()),
            ("Content-Length".into(), (COMPACT_LIMIT + 1).to_string()),
        ],
        FixtureBody::Empty,
    )
    .await;
    let (gateway_url, gateway) = spawn_gateway(install_native_state(&upstream_url)).await;

    let response = reqwest::Client::new()
        .post(format!("{gateway_url}/v1/responses/compact"))
        .bearer_auth(TEST_KEY)
        .header("content-type", "application/json")
        .body(r#"{"model":"gpt-test","input":"hello"}"#)
        .send()
        .await
        .expect("send AP-0077 compact request");
    let status = response.status();
    let body = response
        .text()
        .await
        .expect("read AP-0077 compact response");

    upstream
        .await
        .expect("compact upstream fixture should finish");
    gateway.abort();

    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert!(
        body.contains("64 MiB"),
        "expected explicit compact byte-cap error, got {body:?}"
    );
}

#[tokio::test]
async fn error_chunked_oversize_is_rejected_while_streaming() {
    let (upstream_url, upstream) = spawn_raw_upstream(
        "400 Bad Request",
        vec![
            ("Content-Type".into(), "application/json".into()),
            ("Transfer-Encoding".into(), "chunked".into()),
        ],
        FixtureBody::Chunked {
            total_bytes: ERROR_LIMIT + 1,
            chunk_bytes: 64 * 1024,
        },
    )
    .await;
    let (gateway_url, gateway) = spawn_gateway(install_native_state(&upstream_url)).await;

    let response = reqwest::Client::new()
        .post(format!("{gateway_url}/v1/responses"))
        .bearer_auth(TEST_KEY)
        .header("content-type", "application/json")
        .body(r#"{"model":"gpt-test","input":"hello"}"#)
        .send()
        .await
        .expect("send AP-0077 error-body request");
    let status = response.status();
    let body = response.text().await.expect("read AP-0077 error response");

    upstream
        .await
        .expect("error upstream fixture should finish");
    gateway.abort();

    assert_eq!(status, StatusCode::BAD_GATEWAY);
    assert!(
        body.contains("1 MiB"),
        "expected explicit error-body byte-cap error, got prefix {:?}",
        &body[..body.len().min(200)]
    );
}

#[tokio::test]
async fn normal_snapshot_response_remains_accepted() {
    let body = br#"{"schema_version":1,"source_id":"ap0077","generation":1}"#.to_vec();
    let (base_url, upstream) = spawn_raw_upstream(
        "200 OK",
        vec![
            ("Content-Type".into(), "application/json".into()),
            ("Content-Length".into(), body.len().to_string()),
        ],
        FixtureBody::Fixed(body),
    )
    .await;

    let state = AppState::new();
    let client = reqwest::Client::new();
    let outcome = sync_snapshot_once(
        &state,
        &client,
        &format!("{base_url}/snapshot"),
        "ap0077-internal-token",
    )
    .await
    .expect("bounded normal snapshot should remain accepted");
    upstream
        .await
        .expect("normal snapshot fixture should finish");

    assert!(matches!(
        outcome,
        agentproxy_gateway::SnapshotSyncOutcome::Installed {
            source_id,
            generation: 1
        } if source_id == "ap0077"
    ));
}

#[tokio::test]
async fn normal_compact_response_is_preserved() {
    let body = br#"{"ok":true}"#.to_vec();
    let expected = String::from_utf8(body.clone()).expect("fixture body is UTF-8");
    let (upstream_url, upstream) = spawn_raw_upstream(
        "200 OK",
        vec![
            ("Content-Type".into(), "application/json".into()),
            ("Content-Length".into(), body.len().to_string()),
        ],
        FixtureBody::Fixed(body),
    )
    .await;
    let (gateway_url, gateway) = spawn_gateway(install_native_state(&upstream_url)).await;

    let response = reqwest::Client::new()
        .post(format!("{gateway_url}/v1/responses/compact"))
        .bearer_auth(TEST_KEY)
        .header("content-type", "application/json")
        .body(r#"{"model":"gpt-test","input":"hello"}"#)
        .send()
        .await
        .expect("send normal AP-0077 compact request");
    let status = response.status();
    let body = response.text().await.expect("read normal compact response");

    upstream
        .await
        .expect("normal compact fixture should finish");
    gateway.abort();

    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, expected);
}

#[tokio::test]
async fn normal_small_error_response_remains_bounded_after_public_error_sanitization() {
    let upstream_body = br#"{"error":"bad request"}"#.to_vec();
    let (upstream_url, upstream) = spawn_raw_upstream(
        "400 Bad Request",
        vec![
            ("Content-Type".into(), "application/json".into()),
            ("Content-Length".into(), upstream_body.len().to_string()),
        ],
        FixtureBody::Fixed(upstream_body),
    )
    .await;
    let (gateway_url, gateway) = spawn_gateway(install_native_state(&upstream_url)).await;

    let response = reqwest::Client::new()
        .post(format!("{gateway_url}/v1/responses"))
        .bearer_auth(TEST_KEY)
        .header("content-type", "application/json")
        .body(r#"{"model":"gpt-test","input":"hello"}"#)
        .send()
        .await
        .expect("send normal AP-0077 error request");
    let status = response.status();
    let body = response.text().await.expect("read normal error response");

    upstream.await.expect("normal error fixture should finish");
    gateway.abort();

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body.len() < 1024 * 1024,
        "small error response must stay bounded"
    );
    assert!(
        !body.contains("bad request"),
        "AP-0085 public error boundary must not reflect the raw provider body: {body}"
    );
    let public: serde_json::Value = serde_json::from_str(&body).expect("sanitized JSON error");
    assert_eq!(
        public["error"]["message"],
        "upstream provider request failed"
    );
    assert_eq!(public["error"]["type"], "upstream_provider_error");
    assert!(public["error_id"]
        .as_str()
        .is_some_and(|error_id| error_id.starts_with("apx-")));
}
