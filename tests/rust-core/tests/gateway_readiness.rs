use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use agentproxy_control_protocol::snapshot::{
    ConfigSnapshot, SnapshotError, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::{app, AppState};
use tower::ServiceExt;

#[test]
fn rejects_unsupported_or_stale_snapshots() {
    let state = AppState::new();
    let unsupported = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION + 1, 1);
    assert_eq!(
        state.install_snapshot(unsupported, false),
        Err(SnapshotError::UnsupportedSchema {
            received: SUPPORTED_SCHEMA_VERSION + 1,
            supported: SUPPORTED_SCHEMA_VERSION,
        })
    );

    state
        .install_snapshot(ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 7), false)
        .unwrap();
    assert_eq!(
        state.install_snapshot(ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 6), false),
        Err(SnapshotError::StaleGeneration {
            current: 7,
            received: 6,
        })
    );
}

#[tokio::test]
async fn health_is_live_while_readiness_tracks_snapshot_installation() {
    let state = AppState::new();
    let router = app(state.clone());

    let health = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/healthz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(health.status(), StatusCode::OK);

    let before = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/readyz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(before.status(), StatusCode::SERVICE_UNAVAILABLE);

    state
        .install_snapshot(ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 1), false)
        .unwrap();

    let after = router
        .oneshot(
            Request::builder()
                .uri("/readyz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(after.status(), StatusCode::OK);
}

#[test]
fn accepts_generation_reset_from_restarted_control_plane() {
    let state = AppState::new();
    let mut first = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 7);
    first.source_id = "node-a".to_owned();
    state.install_snapshot(first, false).unwrap();

    let mut restarted = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 1);
    restarted.source_id = "node-b".to_owned();
    state.install_snapshot(restarted, false).unwrap();
}
