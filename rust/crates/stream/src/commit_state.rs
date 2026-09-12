#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommitState {
    PreCommit,
    Committed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FirstEventClass {
    Valid,
    RetryableError,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommitDecision {
    ForwardAndCommit,
    RetryBeforeCommit,
    ForwardWithoutRetry,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StreamCommit {
    state: CommitState,
}

impl Default for StreamCommit {
    fn default() -> Self {
        Self::new()
    }
}

impl StreamCommit {
    pub const fn new() -> Self {
        Self {
            state: CommitState::PreCommit,
        }
    }

    pub const fn state(&self) -> CommitState {
        self.state
    }

    pub fn observe_first_event(&mut self, class: FirstEventClass) -> CommitDecision {
        if self.state != CommitState::PreCommit {
            return CommitDecision::ForwardWithoutRetry;
        }

        match class {
            FirstEventClass::Valid => {
                self.state = CommitState::Committed;
                CommitDecision::ForwardAndCommit
            }
            FirstEventClass::RetryableError => CommitDecision::RetryBeforeCommit,
        }
    }
}
