use std::time::Duration;

use agentproxy_gateway::snapshot_poll::SnapshotPollPolicy;

fn policy(seed: u64) -> SnapshotPollPolicy {
    SnapshotPollPolicy::with_limits(
        seed,
        Duration::ZERO,
        Duration::from_secs(2),
        Duration::from_secs(60),
        Duration::from_secs(30),
    )
}

#[test]
fn equal_instances_get_desynchronized_success_cadence() {
    let a = policy(1).next_delay();
    let b = policy(2).next_delay();
    assert_ne!(a, b, "different instances must not poll in lockstep");
    assert!(a >= Duration::from_millis(1600) && a <= Duration::from_millis(2400));
    assert!(b >= Duration::from_millis(1600) && b <= Duration::from_millis(2400));
}

#[test]
fn failures_back_off_exponentially_and_success_resets_the_cadence() {
    let mut p = policy(7);
    let normal = p.next_delay();
    p.record_failure();
    let first_failure = p.next_delay();
    p.record_failure();
    let second_failure = p.next_delay();
    assert!(first_failure > normal);
    assert!(second_failure > first_failure);

    for _ in 0..16 {
        p.record_failure();
    }
    assert!(p.next_delay() <= Duration::from_secs(60));

    p.record_success(Duration::from_secs(20));
    assert_eq!(p.failure_count(), 0);
    assert!(p.next_delay() < Duration::from_secs(3));
}

#[test]
fn maximum_stale_threshold_is_observable_once_until_recovery() {
    let mut p = policy(11);
    assert_eq!(p.take_stale_alert(Duration::from_secs(29)), None);
    assert_eq!(
        p.take_stale_alert(Duration::from_secs(30)),
        Some(Duration::from_secs(30))
    );
    assert_eq!(
        p.take_stale_alert(Duration::from_secs(40)),
        None,
        "stale alert should be edge-triggered"
    );

    p.record_success(Duration::from_secs(40));
    assert_eq!(p.take_stale_alert(Duration::from_secs(69)), None);
    assert_eq!(
        p.take_stale_alert(Duration::from_secs(70)),
        Some(Duration::from_secs(30))
    );
}
