use std::time::Duration;

const DEFAULT_BASE_INTERVAL: Duration = Duration::from_secs(2);
const DEFAULT_MAX_BACKOFF: Duration = Duration::from_secs(60);
const DEFAULT_MAX_STALE: Duration = Duration::from_secs(30);
const JITTER_MIN_PER_MILLE: u64 = 800;
const JITTER_SPAN_PER_MILLE: u64 = 401;

#[derive(Debug, Clone)]
pub struct SnapshotPollPolicy {
    jitter_per_mille: u64,
    last_success_at: Duration,
    base_interval: Duration,
    max_backoff: Duration,
    max_stale: Duration,
    failure_count: u32,
    stale_alerted: bool,
}

impl SnapshotPollPolicy {
    pub fn new(seed: u64, now: Duration) -> Self {
        Self::with_limits(
            seed,
            now,
            DEFAULT_BASE_INTERVAL,
            DEFAULT_MAX_BACKOFF,
            DEFAULT_MAX_STALE,
        )
    }

    pub fn with_limits(
        seed: u64,
        now: Duration,
        base_interval: Duration,
        max_backoff: Duration,
        max_stale: Duration,
    ) -> Self {
        let mixed = seed ^ seed.rotate_left(17) ^ 0x9e37_79b9_7f4a_7c15;
        let jitter_per_mille = JITTER_MIN_PER_MILLE + (mixed % JITTER_SPAN_PER_MILLE);
        Self {
            jitter_per_mille,
            last_success_at: now,
            base_interval,
            max_backoff,
            max_stale,
            failure_count: 0,
            stale_alerted: false,
        }
    }

    pub fn next_delay(&self) -> Duration {
        let exponent = self.failure_count.min(31);
        let multiplier = 1_u64 << exponent;
        let base_ms = self.base_interval.as_millis().min(u128::from(u64::MAX)) as u64;
        let max_ms = self.max_backoff.as_millis().min(u128::from(u64::MAX)) as u64;
        let backed_off_ms = base_ms.saturating_mul(multiplier).min(max_ms);
        let jittered_ms = backed_off_ms
            .saturating_mul(self.jitter_per_mille)
            .saturating_div(1000)
            .min(max_ms);
        Duration::from_millis(jittered_ms)
    }

    pub fn record_failure(&mut self) {
        self.failure_count = self.failure_count.saturating_add(1);
    }

    pub fn record_success(&mut self, now: Duration) {
        self.failure_count = 0;
        self.last_success_at = now;
        self.stale_alerted = false;
    }

    pub const fn failure_count(&self) -> u32 {
        self.failure_count
    }

    pub fn take_stale_alert(&mut self, now: Duration) -> Option<Duration> {
        let stale_for = now.saturating_sub(self.last_success_at);
        if stale_for < self.max_stale || self.stale_alerted {
            return None;
        }
        self.stale_alerted = true;
        Some(stale_for)
    }
}
