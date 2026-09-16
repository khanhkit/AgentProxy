use std::collections::HashMap;

use agentproxy_control_protocol::snapshot::{
    CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::AppState;

fn state_with_accounts(max_concurrent: Option<u32>) -> AppState {
    let state = AppState::new();
    let mut snapshot = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 1);
    snapshot.codex_connections = ["account-a", "account-b"]
        .into_iter()
        .map(|id| CodexConnectionConfig {
            id: id.to_owned(),
            access_token: format!("token-{id}"),
            workspace_id: None,
            base_url: "https://example.invalid".to_owned(),
            max_concurrent,
            credential_version: 1,
        })
        .collect();
    state
        .install_snapshot(snapshot, true)
        .expect("test snapshot installs");
    state
}

#[test]
fn equal_accounts_are_fair_across_sequential_short_requests() {
    let state = state_with_accounts(Some(1));
    let mut counts = HashMap::<String, usize>::new();

    for _ in 0..1_000 {
        let selected = state
            .select_codex_account()
            .expect("at least one equal account remains eligible");
        *counts.entry(selected.config.id.clone()).or_default() += 1;
        drop(selected);
    }

    let a = *counts.get("account-a").unwrap_or(&0);
    let b = *counts.get("account-b").unwrap_or(&0);
    assert!(
        a >= 400 && b >= 400,
        "equal accounts were not fairly rotated: {a}/{b}"
    );
}

#[test]
fn fair_tie_breaking_preserves_max_concurrent_leases() {
    let state = state_with_accounts(Some(1));
    let first = state
        .select_codex_account()
        .expect("first account available");
    let second = state
        .select_codex_account()
        .expect("second equal account available while first is leased");
    assert_ne!(first.config.id, second.config.id);
    assert!(
        state.select_codex_account().is_none(),
        "both max_concurrent=1 accounts are already leased"
    );
    drop(first);
    assert!(state.select_codex_account().is_some());
}
