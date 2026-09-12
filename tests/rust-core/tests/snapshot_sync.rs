use std::sync::{Arc, Mutex};

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use agentproxy_control_protocol::snapshot::{ConfigSnapshot, SUPPORTED_SCHEMA_VERSION};
use agentproxy_gateway::{sync_snapshot_once, AppState, SnapshotSyncOutcome};
use tokio::net::TcpListener;

#[derive(Clone)]
struct MockControl {
    token: &'static str,
    snapshot: Arc<Mutex<ConfigSnapshot>>,
}

async fn snapshot(State(state): State<MockControl>, headers: HeaderMap) -> impl IntoResponse {
    if headers
        .get("x-agentproxy-internal-service-token")
        .and_then(|v| v.to_str().ok())
        != Some(state.token)
    {
        return (StatusCode::FORBIDDEN, "forbidden").into_response();
    }
    Json(state.snapshot.lock().unwrap().clone()).into_response()
}

async fn spawn_control(initial: ConfigSnapshot) -> (String, Arc<Mutex<ConfigSnapshot>>) {
    let snapshot_state = Arc::new(Mutex::new(initial));
    let state = MockControl {
        token: "secret",
        snapshot: snapshot_state.clone(),
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(
            listener,
            Router::new()
                .route("/snapshot", get(snapshot))
                .with_state(state),
        )
        .await
        .unwrap();
    });
    (format!("http://{addr}/snapshot"), snapshot_state)
}

fn snapshot_for(source: &str, generation: u64) -> ConfigSnapshot {
    let mut snapshot = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, generation);
    snapshot.source_id = source.to_owned();
    snapshot
}

#[tokio::test]
async fn sync_installs_changes_and_skips_noop_generation() {
    let (url, remote) = spawn_control(snapshot_for("node-a", 1)).await;
    let state = AppState::new();
    let client = reqwest::Client::new();

    let first = sync_snapshot_once(&state, &client, &url, "secret")
        .await
        .unwrap();
    assert_eq!(
        first,
        SnapshotSyncOutcome::Installed {
            source_id: "node-a".into(),
            generation: 1
        }
    );
    assert!(state.is_ready());

    let same = sync_snapshot_once(&state, &client, &url, "secret")
        .await
        .unwrap();
    assert_eq!(
        same,
        SnapshotSyncOutcome::Unchanged {
            source_id: "node-a".into(),
            generation: 1
        }
    );

    *remote.lock().unwrap() = snapshot_for("node-a", 2);
    let changed = sync_snapshot_once(&state, &client, &url, "secret")
        .await
        .unwrap();
    assert_eq!(
        changed,
        SnapshotSyncOutcome::Installed {
            source_id: "node-a".into(),
            generation: 2
        }
    );
}

#[tokio::test]
async fn sync_accepts_generation_reset_after_control_plane_restart() {
    let (url, remote) = spawn_control(snapshot_for("node-a", 9)).await;
    let state = AppState::new();
    let client = reqwest::Client::new();
    sync_snapshot_once(&state, &client, &url, "secret")
        .await
        .unwrap();

    *remote.lock().unwrap() = snapshot_for("node-b", 1);
    let restarted = sync_snapshot_once(&state, &client, &url, "secret")
        .await
        .unwrap();
    assert_eq!(
        restarted,
        SnapshotSyncOutcome::Installed {
            source_id: "node-b".into(),
            generation: 1
        }
    );
}

#[tokio::test]
async fn failed_sync_keeps_last_good_snapshot_ready() {
    let (url, _) = spawn_control(snapshot_for("node-a", 1)).await;
    let state = AppState::new();
    let client = reqwest::Client::new();
    sync_snapshot_once(&state, &client, &url, "secret")
        .await
        .unwrap();

    assert!(sync_snapshot_once(&state, &client, &url, "wrong")
        .await
        .is_err());
    assert!(state.is_ready());
}
