use std::sync::Arc;

use agentproxy_account::{selector::choose_better, AccountRuntime};

#[test]
fn p2c_prefers_healthier_candidate() {
    let first = Arc::new(AccountRuntime::new("first", None));
    let second = Arc::new(AccountRuntime::new("second", None));
    first.set_health_score(500);
    second.set_health_score(900);

    assert_eq!(choose_better(&first, &second).id(), "second");
}

#[test]
fn p2c_penalizes_in_flight_load_when_health_is_equal() {
    let first = Arc::new(AccountRuntime::new("first", None));
    let second = Arc::new(AccountRuntime::new("second", None));
    first.set_health_score(800);
    second.set_health_score(800);

    let _lease_a = first.try_acquire().unwrap();
    let _lease_b = first.try_acquire().unwrap();

    assert_eq!(choose_better(&first, &second).id(), "second");
}
