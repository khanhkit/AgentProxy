use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

pub const MAX_PROVIDER_COOLDOWN: Duration = Duration::from_secs(5 * 60);
pub const MAX_TRANSIENT_COOLDOWN: Duration = Duration::from_secs(30);
const DEFAULT_PROVIDER_COOLDOWN: Duration = Duration::from_secs(5);
const MIN_PROVIDER_COOLDOWN: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthState {
    Valid,
    Invalid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RefreshState {
    Unknown,
    Refreshable,
    PermanentlyInvalid,
}

#[derive(Debug)]
struct RuntimeHealthState {
    auth_state: AuthState,
    refresh_state: RefreshState,
    account_quota_until: Option<Instant>,
    model_quota_until: HashMap<String, Instant>,
    transient_cooldown_until: Option<Instant>,
    recovery_probe_at: Option<Instant>,
    consecutive_failures: u32,
    last_success_at: Option<Instant>,
    last_failure_at: Option<Instant>,
}

impl Default for RuntimeHealthState {
    fn default() -> Self {
        Self {
            auth_state: AuthState::Valid,
            refresh_state: RefreshState::Unknown,
            account_quota_until: None,
            model_quota_until: HashMap::new(),
            transient_cooldown_until: None,
            recovery_probe_at: None,
            consecutive_failures: 0,
            last_success_at: None,
            last_failure_at: None,
        }
    }
}

#[derive(Debug)]
pub struct AccountRuntime {
    id: String,
    max_concurrent: AtomicU32,
    in_flight: AtomicU32,
    health_score: AtomicU32,
    state: Mutex<RuntimeHealthState>,
}

impl AccountRuntime {
    pub fn new(id: impl Into<String>, max_concurrent: Option<u32>) -> Self {
        Self {
            id: id.into(),
            max_concurrent: AtomicU32::new(encode_max_concurrent(max_concurrent)),
            in_flight: AtomicU32::new(0),
            health_score: AtomicU32::new(1000),
            state: Mutex::new(RuntimeHealthState::default()),
        }
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn in_flight(&self) -> u32 {
        self.in_flight.load(Ordering::Acquire)
    }

    pub fn health_score(&self) -> u32 {
        self.health_score.load(Ordering::Acquire)
    }

    pub fn set_health_score(&self, score: u32) {
        self.health_score.store(score.min(1000), Ordering::Release);
    }

    pub fn auth_state(&self) -> AuthState {
        self.lock_state().auth_state
    }

    pub fn refresh_state(&self) -> RefreshState {
        self.lock_state().refresh_state
    }

    pub fn set_refresh_state(&self, refresh_state: RefreshState) {
        self.lock_state().refresh_state = refresh_state;
    }

    pub fn record_auth_rejection(&self) {
        let mut state = self.lock_state();
        state.auth_state = AuthState::Invalid;
        state.last_failure_at = Some(Instant::now());
    }

    pub fn record_refresh_success(&self) {
        let mut state = self.lock_state();
        state.auth_state = AuthState::Valid;
        state.refresh_state = RefreshState::Refreshable;
    }

    pub fn record_refresh_failure(&self, permanent: bool) {
        self.lock_state().refresh_state = if permanent {
            RefreshState::PermanentlyInvalid
        } else {
            RefreshState::Refreshable
        };
    }

    pub fn record_rate_limit(
        &self,
        now: Instant,
        model: Option<&str>,
        retry_after: Option<Duration>,
    ) {
        let requested = retry_after.unwrap_or(DEFAULT_PROVIDER_COOLDOWN);
        let duration = requested
            .max(MIN_PROVIDER_COOLDOWN)
            .min(MAX_PROVIDER_COOLDOWN);
        let deadline = now + duration;
        let mut state = self.lock_state();
        state.last_failure_at = Some(now);
        match model.filter(|value| !value.is_empty()) {
            Some(model) => {
                let slot = state
                    .model_quota_until
                    .entry(model.to_owned())
                    .or_insert(deadline);
                if deadline > *slot {
                    *slot = deadline;
                }
            }
            None => extend_deadline(&mut state.account_quota_until, deadline),
        }
    }

    pub fn record_transient_failure(&self, now: Instant) {
        let mut state = self.lock_state();
        state.consecutive_failures = state.consecutive_failures.saturating_add(1);
        state.last_failure_at = Some(now);
        let exponent = state.consecutive_failures.saturating_sub(1).min(5);
        let seconds = 1u64 << exponent;
        let duration = Duration::from_secs(seconds).min(MAX_TRANSIENT_COOLDOWN);
        let deadline = now + duration;
        extend_deadline(&mut state.transient_cooldown_until, deadline);
        state.recovery_probe_at = state.transient_cooldown_until;
        let penalty = state.consecutive_failures.saturating_mul(100).min(900);
        self.health_score
            .store(1000u32.saturating_sub(penalty), Ordering::Release);
    }

    pub fn record_success(&self, now: Instant, _model: Option<&str>) {
        let mut state = self.lock_state();
        state.consecutive_failures = 0;
        state.transient_cooldown_until = None;
        state.recovery_probe_at = None;
        state.last_success_at = Some(now);
        if state
            .account_quota_until
            .is_some_and(|deadline| deadline <= now)
        {
            state.account_quota_until = None;
        }
        state
            .model_quota_until
            .retain(|_, deadline| *deadline > now);
        self.health_score.store(1000, Ordering::Release);
    }

    pub fn record_cancellation(&self) {}

    pub fn consecutive_failures(&self) -> u32 {
        self.lock_state().consecutive_failures
    }

    pub fn last_success_at(&self) -> Option<Instant> {
        self.lock_state().last_success_at
    }

    pub fn last_failure_at(&self) -> Option<Instant> {
        self.lock_state().last_failure_at
    }

    pub fn recovery_probe_at(&self) -> Option<Instant> {
        self.lock_state().recovery_probe_at
    }

    pub fn cooldown_remaining(&self, now: Instant, model: Option<&str>) -> Option<Duration> {
        let state = self.lock_state();
        let mut deadline = state
            .account_quota_until
            .filter(|deadline| *deadline > now)
            .or_else(|| {
                state
                    .transient_cooldown_until
                    .filter(|deadline| *deadline > now)
            });

        if let Some(transient) = state
            .transient_cooldown_until
            .filter(|deadline| *deadline > now)
        {
            if deadline.is_none_or(|current| transient > current) {
                deadline = Some(transient);
            }
        }
        if let Some(model_deadline) = model
            .and_then(|model| state.model_quota_until.get(model).copied())
            .filter(|deadline| *deadline > now)
        {
            if deadline.is_none_or(|current| model_deadline > current) {
                deadline = Some(model_deadline);
            }
        }

        deadline.map(|deadline| deadline.duration_since(now))
    }

    pub fn is_selectable_at(&self, now: Instant, model: Option<&str>) -> bool {
        let state = self.lock_state();
        if state.auth_state == AuthState::Invalid {
            return false;
        }
        if state
            .account_quota_until
            .is_some_and(|deadline| deadline > now)
            || state
                .transient_cooldown_until
                .is_some_and(|deadline| deadline > now)
        {
            return false;
        }
        !model
            .and_then(|model| state.model_quota_until.get(model))
            .is_some_and(|deadline| *deadline > now)
    }

    pub fn set_max_concurrent(&self, max_concurrent: Option<u32>) {
        self.max_concurrent
            .store(encode_max_concurrent(max_concurrent), Ordering::Release);
    }

    pub fn max_concurrent(&self) -> Option<u32> {
        decode_max_concurrent(self.max_concurrent.load(Ordering::Acquire))
    }

    pub fn is_available(&self) -> bool {
        let current = self.in_flight.load(Ordering::Acquire);
        let max = self.max_concurrent.load(Ordering::Acquire);
        current != u32::MAX && (max == u32::MAX || current < max)
    }

    pub fn try_acquire(self: &Arc<Self>) -> Option<AccountLease> {
        loop {
            let current = self.in_flight.load(Ordering::Acquire);
            let max = self.max_concurrent.load(Ordering::Acquire);
            if current == u32::MAX || (max != u32::MAX && current >= max) {
                return None;
            }

            if self
                .in_flight
                .compare_exchange_weak(current, current + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Some(AccountLease {
                    account: Arc::clone(self),
                });
            }
        }
    }

    fn lock_state(&self) -> std::sync::MutexGuard<'_, RuntimeHealthState> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[derive(Debug)]
pub struct AccountLease {
    account: Arc<AccountRuntime>,
}

impl Drop for AccountLease {
    fn drop(&mut self) {
        self.account.in_flight.fetch_sub(1, Ordering::AcqRel);
    }
}

fn extend_deadline(slot: &mut Option<Instant>, deadline: Instant) {
    if slot.is_none_or(|current| deadline > current) {
        *slot = Some(deadline);
    }
}

fn encode_max_concurrent(value: Option<u32>) -> u32 {
    value.unwrap_or(u32::MAX)
}

fn decode_max_concurrent(value: u32) -> Option<u32> {
    (value != u32::MAX).then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn auth_rejection_is_distinct_from_refreshability_and_transient_health() {
        let runtime = AccountRuntime::new("a", None);
        runtime.set_refresh_state(RefreshState::Refreshable);
        runtime.record_auth_rejection();

        assert_eq!(runtime.auth_state(), AuthState::Invalid);
        assert_eq!(runtime.refresh_state(), RefreshState::Refreshable);
        assert_eq!(runtime.health_score(), 1000);
        assert!(!runtime.is_selectable_at(Instant::now(), Some("gpt-test")));

        runtime.record_refresh_success();
        assert_eq!(runtime.auth_state(), AuthState::Valid);
        assert_eq!(runtime.refresh_state(), RefreshState::Refreshable);
        assert_eq!(runtime.health_score(), 1000);
        assert!(runtime.is_selectable_at(Instant::now(), Some("gpt-test")));
    }

    #[test]
    fn permanent_refresh_failure_does_not_reclassify_transient_health() {
        let runtime = AccountRuntime::new("a", None);
        runtime.record_refresh_failure(true);

        assert_eq!(runtime.refresh_state(), RefreshState::PermanentlyInvalid);
        assert_eq!(runtime.auth_state(), AuthState::Valid);
        assert_eq!(runtime.health_score(), 1000);
    }

    #[test]
    fn retry_after_is_model_scoped_clamped_and_never_shortens_existing_cooldown() {
        let runtime = AccountRuntime::new("a", None);
        let now = Instant::now();

        runtime.record_rate_limit(now, Some("gpt-test"), Some(Duration::from_secs(3600)));
        assert_eq!(
            runtime.cooldown_remaining(now, Some("gpt-test")),
            Some(MAX_PROVIDER_COOLDOWN)
        );
        assert_eq!(runtime.cooldown_remaining(now, Some("other")), None);

        runtime.record_rate_limit(now, Some("gpt-test"), Some(Duration::from_secs(1)));
        assert_eq!(
            runtime.cooldown_remaining(now, Some("gpt-test")),
            Some(MAX_PROVIDER_COOLDOWN)
        );
    }

    #[test]
    fn concurrent_success_does_not_clear_stronger_active_quota() {
        let runtime = AccountRuntime::new("a", None);
        let now = Instant::now();
        runtime.record_rate_limit(now, Some("gpt-test"), Some(Duration::from_secs(30)));
        runtime.record_success(now + Duration::from_secs(1), Some("gpt-test"));

        assert_eq!(
            runtime.cooldown_remaining(now + Duration::from_secs(1), Some("gpt-test")),
            Some(Duration::from_secs(29))
        );
    }

    #[test]
    fn account_wide_rate_limit_blocks_every_model() {
        let runtime = AccountRuntime::new("a", None);
        let now = Instant::now();
        runtime.record_rate_limit(now, None, Some(Duration::from_secs(12)));

        assert!(!runtime.is_selectable_at(now, Some("gpt-test")));
        assert!(!runtime.is_selectable_at(now, Some("other")));
        assert_eq!(
            runtime.cooldown_remaining(now, Some("gpt-test")),
            Some(Duration::from_secs(12))
        );
    }

    #[test]
    fn transient_failure_is_bounded_and_success_recovers_health() {
        let runtime = AccountRuntime::new("a", None);
        let now = Instant::now();
        runtime.record_transient_failure(now);

        assert_eq!(runtime.consecutive_failures(), 1);
        assert!(runtime.health_score() < 1000);
        assert!(!runtime.is_selectable_at(now, Some("gpt-test")));
        assert!(runtime.recovery_probe_at().is_some());
        assert_eq!(runtime.last_failure_at(), Some(now));

        let recovered_at = now + MAX_TRANSIENT_COOLDOWN + Duration::from_secs(1);
        runtime.record_success(recovered_at, Some("gpt-test"));
        assert_eq!(runtime.consecutive_failures(), 0);
        assert_eq!(runtime.health_score(), 1000);
        assert_eq!(runtime.recovery_probe_at(), None);
        assert_eq!(runtime.last_success_at(), Some(recovered_at));
        assert!(runtime.is_selectable_at(recovered_at, Some("gpt-test")));
    }

    #[test]
    fn caller_cancellation_does_not_mutate_runtime_state() {
        let runtime = AccountRuntime::new("a", None);
        let now = Instant::now();
        runtime.record_cancellation();

        assert_eq!(runtime.auth_state(), AuthState::Valid);
        assert_eq!(runtime.refresh_state(), RefreshState::Unknown);
        assert_eq!(runtime.consecutive_failures(), 0);
        assert_eq!(runtime.last_failure_at(), None);
        assert_eq!(runtime.cooldown_remaining(now, Some("gpt-test")), None);
        assert_eq!(runtime.health_score(), 1000);
    }
}
