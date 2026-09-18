use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(usize)]
pub enum RequestOutcome {
    Success = 0,
    FailedPrecommit,
    FailedPostcommit,
    CancelledPrecommit,
    CancelledPostcommit,
    Incomplete,
    RecoveredByRetry,
    RecoveredByFallback,
}

impl RequestOutcome {
    const COUNT: usize = 8;

    const fn index(self) -> usize {
        self as usize
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(usize)]
pub enum AttemptLifecycleOutcome {
    SuccessTerminal = 0,
    RetryablePrecommitFailure,
    FatalPrecommitFailure,
    PostcommitFailure,
    DownstreamCancelled,
    UpstreamCancelled,
    TimeoutFirstByte,
    TimeoutIdle,
    TimeoutTotal,
}

impl AttemptLifecycleOutcome {
    const COUNT: usize = 9;

    const fn index(self) -> usize {
        self as usize
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LifecycleSnapshot {
    request_counts: [u64; RequestOutcome::COUNT],
    attempt_counts: [u64; AttemptLifecycleOutcome::COUNT],
}

impl Default for LifecycleSnapshot {
    fn default() -> Self {
        Self {
            request_counts: [0; RequestOutcome::COUNT],
            attempt_counts: [0; AttemptLifecycleOutcome::COUNT],
        }
    }
}

impl LifecycleSnapshot {
    pub fn request_count(&self, outcome: RequestOutcome) -> u64 {
        self.request_counts[outcome.index()]
    }

    pub fn attempt_count(&self, outcome: AttemptLifecycleOutcome) -> u64 {
        self.attempt_counts[outcome.index()]
    }
}

#[derive(Clone, Default)]
pub(crate) struct LifecycleRecorder {
    inner: Arc<Mutex<LifecycleSnapshot>>,
}

impl LifecycleRecorder {
    pub(crate) fn record_request(&self, outcome: RequestOutcome) {
        let mut snapshot = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        snapshot.request_counts[outcome.index()] =
            snapshot.request_counts[outcome.index()].saturating_add(1);
    }

    pub(crate) fn record_attempt(&self, outcome: AttemptLifecycleOutcome) {
        let mut snapshot = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        snapshot.attempt_counts[outcome.index()] =
            snapshot.attempt_counts[outcome.index()].saturating_add(1);
    }

    pub(crate) fn snapshot(&self) -> LifecycleSnapshot {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub(crate) fn request_tracker(&self) -> RequestLifecycleTracker {
        RequestLifecycleTracker {
            recorder: self.clone(),
            state: Arc::new(Mutex::new(RequestLifecycleState::default())),
        }
    }
}

#[derive(Debug, Default)]
struct RequestLifecycleState {
    finalized: bool,
    saw_retry: bool,
    saw_fallback: bool,
}

#[derive(Clone)]
pub(crate) struct RequestLifecycleTracker {
    recorder: LifecycleRecorder,
    state: Arc<Mutex<RequestLifecycleState>>,
}

impl RequestLifecycleTracker {
    pub(crate) fn record_attempt(&self, outcome: AttemptLifecycleOutcome) {
        self.recorder.record_attempt(outcome);
    }

    pub(crate) fn note_retry(&self) {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.saw_retry = true;
    }

    pub(crate) fn note_fallback(&self) {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.saw_fallback = true;
    }

    pub(crate) fn finish(&self, outcome: RequestOutcome) -> bool {
        let resolved = {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if state.finalized {
                return false;
            }
            state.finalized = true;
            if outcome == RequestOutcome::Success {
                if state.saw_fallback {
                    RequestOutcome::RecoveredByFallback
                } else if state.saw_retry {
                    RequestOutcome::RecoveredByRetry
                } else {
                    RequestOutcome::Success
                }
            } else {
                outcome
            }
        };
        self.recorder.record_request(resolved);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_and_attempt_scopes_are_independent_and_finalize_once() {
        let recorder = LifecycleRecorder::default();
        let tracker = recorder.request_tracker();

        tracker.record_attempt(AttemptLifecycleOutcome::RetryablePrecommitFailure);
        tracker.note_retry();
        tracker.note_fallback();
        tracker.record_attempt(AttemptLifecycleOutcome::SuccessTerminal);

        assert!(tracker.finish(RequestOutcome::Success));
        assert!(!tracker.finish(RequestOutcome::FailedPostcommit));

        let snapshot = recorder.snapshot();
        assert_eq!(
            snapshot.attempt_count(AttemptLifecycleOutcome::RetryablePrecommitFailure),
            1
        );
        assert_eq!(
            snapshot.attempt_count(AttemptLifecycleOutcome::SuccessTerminal),
            1
        );
        assert_eq!(
            snapshot.request_count(RequestOutcome::RecoveredByFallback),
            1
        );
        assert_eq!(snapshot.request_count(RequestOutcome::FailedPostcommit), 0);
    }

    #[test]
    fn timeout_and_cancellation_outcomes_remain_distinct() {
        let recorder = LifecycleRecorder::default();

        for outcome in [
            AttemptLifecycleOutcome::DownstreamCancelled,
            AttemptLifecycleOutcome::UpstreamCancelled,
            AttemptLifecycleOutcome::TimeoutFirstByte,
            AttemptLifecycleOutcome::TimeoutIdle,
            AttemptLifecycleOutcome::TimeoutTotal,
        ] {
            recorder.record_attempt(outcome);
        }

        for outcome in [
            RequestOutcome::CancelledPrecommit,
            RequestOutcome::CancelledPostcommit,
            RequestOutcome::Incomplete,
            RequestOutcome::RecoveredByRetry,
        ] {
            recorder.record_request(outcome);
        }

        let snapshot = recorder.snapshot();
        assert_eq!(
            snapshot.attempt_count(AttemptLifecycleOutcome::TimeoutFirstByte),
            1
        );
        assert_eq!(
            snapshot.attempt_count(AttemptLifecycleOutcome::DownstreamCancelled),
            1
        );
        assert_eq!(
            snapshot.request_count(RequestOutcome::CancelledPostcommit),
            1
        );
        assert_eq!(snapshot.request_count(RequestOutcome::RecoveredByRetry), 1);
    }
}
