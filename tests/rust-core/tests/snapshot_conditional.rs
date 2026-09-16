use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};

use agentproxy_control_protocol::snapshot::{ConfigSnapshot, SUPPORTED_SCHEMA_VERSION};
use agentproxy_gateway::{
    sync_snapshot_once_conditional, AppState, SnapshotConditionalOutcome, SnapshotSyncOutcome,
};
use axum::{
    extract::State,
    http::{header::ETAG, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use tokio::net::TcpListener;

#[derive(Clone)]
struct MockControl {
    snapshot: Arc<Mutex<ConfigSnapshot>>,
    body_responses: Arc<AtomicUsize>,
}

fn etag_for(snapshot: &ConfigSnapshot) -> String {
    format!("\"{}:{}\"", snapshot.source_id, snapshot.generation)
}

async fn snapshot(State(state): State<MockControl>, headers: HeaderMap) -> Response {
    let current = state.snapshot.lock().unwrap().clone();
    let etag = etag_for(&current);
    if headers
        .get("if-none-match")
        .and_then(|value| value.to_str().ok())
        == Some(etag.as_str())
    {
        let mut response = StatusCode::NOT_MODIFIED.into_response();
        response
            .headers_mut()
            .insert(ETAG, HeaderValue::from_str(&etag).unwrap());
        return response;
    }

    state.body_responses.fetch_add(1, Ordering::SeqCst);
    let mut response = Json(current).into_response();
    response
        .headers_mut()
        .insert(ETAG, HeaderValue::from_str(&etag).unwrap());
    response
}

async fn spawn_control(
    initial: ConfigSnapshot,
) -> (String, Arc<Mutex<ConfigSnapshot>>, Arc<AtomicUsize>) {
    let snapshot_state = Arc::new(Mutex::new(initial));
    let body_responses = Arc::new(AtomicUsize::new(0));
    let state = MockControl {
        snapshot: snapshot_state.clone(),
        body_responses: body_responses.clone(),
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, Router::new().route("/snapshot", get(snapshot)).with_state(state))
            .await
            .unwrap();
    });
    (format!("http://{addr}/snapshot"), snapshot_state, body_responses)
}

fn snapshot_for(source: &str, generation: u64) -> ConfigSnapshot {
    let mut snapshot = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, generation);
    snapshot.source_id = source.to_owned();
    snapshot
}

#[tokio::test]
async fn conditional_snapshot_sync_uses_etag_and_skips_unchanged_body_transfer() {
    let (url, remote, body_responses) = spawn_control(snapshot_for("node-a", 1)).await;
    let state = AppState::new();
    let client = reqwest::Client::new();

    let first = sync_snapshot_once_conditional(&state, &client, &url, "test-token", None)
        .await
        .unwrap();
    assert_eq!(
        first.outcome,
        SnapshotConditionalOutcome::Snapshot(SnapshotSyncOutcome::Installed {
            source_id: "node-a".into(),
            generation: 1,
        })
    );
    let etag = first.etag.expect("first response must provide ETag");
    assert_eq!(body_responses.load(Ordering::SeqCst), 1);

    let unchanged = sync_snapshot_once_conditional(&state, &client, &url, "test-token", Some(&etag))
        .await
        .unwrap();
    assert_eq!(unchanged.outcome, SnapshotConditionalOutcome::NotModified);
    assert_eq!(unchanged.etag.as_deref(), Some(etag.as_str()));
    assert_eq!(body_responses.load(Ordering::SeqCst), 1, "304 must not transfer a second snapshot body");

    *remote.lock().unwrap() = snapshot_for("node-a", 2);
    let changed = sync_snapshot_once_conditional(&state, &client, &url, "test-token", Some(&etag))
        .await
        .unwrap();
    assert_eq!(
        changed.outcome,
        SnapshotConditionalOutcome::Snapshot(SnapshotSyncOutcome::Installed {
            source_id: "node-a".into(),
            generation: 2,
        })
    );
    assert_ne!(changed.etag.as_deref(), Some(etag.as_str()));
    assert_eq!(body_responses.load(Ordering::SeqCst), 2);
}
