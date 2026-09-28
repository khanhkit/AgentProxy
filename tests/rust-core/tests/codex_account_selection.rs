use agentproxy_control_protocol::snapshot::{
    CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::AppState;

fn connection(id: &str) -> CodexConnectionConfig {
    CodexConnectionConfig {
        id: id.to_owned(),
        access_token: format!("token-{id}"),
        workspace_id: Some(format!("workspace-{id}")),
        base_url: "https://chatgpt.com/backend-api/codex".to_owned(),
        max_concurrent: Some(4),
        credential_version: 1,
    }
}

fn snapshot(generation: u64, connections: Vec<CodexConnectionConfig>) -> ConfigSnapshot {
    ConfigSnapshot {
        schema_version: SUPPORTED_SCHEMA_VERSION,
        source_id: "node-a".to_owned(),
        generation,
        codex_connections: connections,
        api_keys: Vec::new(),
        codex_catalog_models: vec!["gpt-5.6-sol-high".to_owned()],
        codex_native_models: vec!["gpt-5.6-sol-high".to_owned()],
    }
}

#[test]
fn snapshot_builds_selectable_codex_runtime_pool() {
    let state = AppState::new();
    state
        .install_snapshot(snapshot(1, vec![connection("a"), connection("b")]), false)
        .unwrap();

    let first = state.select_codex_account().expect("first account");
    assert_eq!(first.config.id, "a");
    assert_eq!(first.config.access_token, "token-a");

    let second = state.select_codex_account().expect("second account");
    assert_eq!(second.config.id, "b");

    drop(first);
    let third = state.select_codex_account().expect("third account");
    assert_eq!(third.config.id, "a");
}

#[test]
fn selection_can_exclude_accounts_already_tried_by_retry_loop() {
    let state = AppState::new();
    state
        .install_snapshot(snapshot(1, vec![connection("a"), connection("b")]), false)
        .unwrap();

    let selected = state
        .select_codex_account_excluding(&["a"])
        .expect("fallback account");
    assert_eq!(selected.config.id, "b");
}

#[test]
fn credential_version_change_starts_new_runtime_epoch_without_invalidating_old_lease() {
    let state = AppState::new();
    let mut only = connection("a");
    only.max_concurrent = Some(1);
    state
        .install_snapshot(snapshot(1, vec![only.clone()]), false)
        .unwrap();

    let old_lease = state.select_codex_account().expect("first lease");
    assert_eq!(old_lease.config.access_token, "token-a");

    only.access_token = "rotated-token".to_owned();
    only.credential_version = 2;
    state
        .install_snapshot(snapshot(2, vec![only]), false)
        .unwrap();

    let rotated = state
        .select_codex_account()
        .expect("credential rotation must start a fresh runtime epoch");
    assert_eq!(rotated.config.access_token, "rotated-token");
    assert_eq!(
        old_lease.config.access_token, "token-a",
        "old in-flight work must remain isolated on the previous runtime/config"
    );

    drop(rotated);
    drop(old_lease);

    let next = state.select_codex_account().expect("lease after releases");
    assert_eq!(next.config.access_token, "rotated-token");
}

#[test]
fn lower_max_concurrency_applies_without_resetting_in_flight() {
    let state = AppState::new();
    let mut only = connection("a");
    only.max_concurrent = Some(2);
    state
        .install_snapshot(snapshot(1, vec![only.clone()]), false)
        .unwrap();

    let lease = state.select_codex_account().expect("first lease");

    only.max_concurrent = Some(1);
    state
        .install_snapshot(snapshot(2, vec![only]), false)
        .unwrap();

    assert!(
        state.select_codex_account().is_none(),
        "new lower limit must apply to the preserved runtime counter"
    );
    drop(lease);
    assert!(state.select_codex_account().is_some());
}

#[test]
fn native_codex_model_resolution_is_fail_closed() {
    let state = AppState::new();
    state
        .install_snapshot(snapshot(1, vec![connection("a")]), false)
        .unwrap();

    assert_eq!(
        state.resolve_native_codex_model("gpt-5.6-sol-high"),
        Some("gpt-5.6-sol-high".to_owned())
    );
    assert_eq!(
        state.resolve_native_codex_model("codex/gpt-5.6-sol-high"),
        Some("gpt-5.6-sol-high".to_owned())
    );
    assert_eq!(
        state.resolve_native_codex_model("cx/gpt-5.6-sol-high"),
        Some("gpt-5.6-sol-high".to_owned())
    );
    assert_eq!(
        state.resolve_native_codex_model("openai/gpt-5.6-sol-high"),
        None
    );
    assert_eq!(state.resolve_native_codex_model("my-combo"), None);
}
