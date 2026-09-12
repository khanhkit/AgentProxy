use std::sync::Arc;

use agentproxy_account::AccountRuntime;

#[test]
fn lease_increments_and_drop_decrements_in_flight() {
    let account = Arc::new(AccountRuntime::new("codex-a", Some(2)));
    assert_eq!(account.in_flight(), 0);

    {
        let _lease = account.try_acquire().expect("first lease");
        assert_eq!(account.in_flight(), 1);
    }

    assert_eq!(account.in_flight(), 0);
}

#[test]
fn max_concurrency_is_enforced_atomically() {
    let account = Arc::new(AccountRuntime::new("codex-a", Some(1)));
    let first = account.try_acquire().expect("first lease");

    assert!(account.try_acquire().is_none());

    drop(first);
    assert!(account.try_acquire().is_some());
}
