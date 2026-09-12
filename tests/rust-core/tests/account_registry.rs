use std::sync::Arc;

use agentproxy_account::{AccountRegistry, AccountRuntime};

#[test]
fn provider_pools_are_independent() {
    let registry = AccountRegistry::default();
    registry.insert("codex", Arc::new(AccountRuntime::new("codex-a", None)));
    registry.insert(
        "antigravity",
        Arc::new(AccountRuntime::new("antigravity-a", None)),
    );

    let codex = registry.for_provider("codex");
    let antigravity = registry.for_provider("antigravity");

    assert_eq!(codex.len(), 1);
    assert_eq!(codex[0].id(), "codex-a");
    assert_eq!(antigravity.len(), 1);
    assert_eq!(antigravity[0].id(), "antigravity-a");
    assert!(registry.for_provider("claude").is_empty());
}
