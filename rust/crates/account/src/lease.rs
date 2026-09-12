use std::sync::{
    atomic::{AtomicU32, Ordering},
    Arc,
};

#[derive(Debug)]
pub struct AccountRuntime {
    id: String,
    max_concurrent: AtomicU32,
    in_flight: AtomicU32,
    health_score: AtomicU32,
}

impl AccountRuntime {
    pub fn new(id: impl Into<String>, max_concurrent: Option<u32>) -> Self {
        Self {
            id: id.into(),
            max_concurrent: AtomicU32::new(encode_max_concurrent(max_concurrent)),
            in_flight: AtomicU32::new(0),
            health_score: AtomicU32::new(1000),
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

fn encode_max_concurrent(value: Option<u32>) -> u32 {
    value.unwrap_or(u32::MAX)
}

fn decode_max_concurrent(value: u32) -> Option<u32> {
    (value != u32::MAX).then_some(value)
}
