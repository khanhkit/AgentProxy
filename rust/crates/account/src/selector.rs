use std::sync::Arc;

use crate::AccountRuntime;

pub fn choose_better(
    first: &Arc<AccountRuntime>,
    second: &Arc<AccountRuntime>,
) -> Arc<AccountRuntime> {
    let first_rank = (first.health_score(), u32::MAX - first.in_flight());
    let second_rank = (second.health_score(), u32::MAX - second.in_flight());

    if second_rank > first_rank {
        Arc::clone(second)
    } else {
        Arc::clone(first)
    }
}
