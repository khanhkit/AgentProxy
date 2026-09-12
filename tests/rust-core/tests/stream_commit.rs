use agentproxy_stream::commit_state::{CommitDecision, CommitState, FirstEventClass, StreamCommit};

#[test]
fn first_valid_event_commits_immediately() {
    let mut stream = StreamCommit::new();

    let decision = stream.observe_first_event(FirstEventClass::Valid);

    assert_eq!(decision, CommitDecision::ForwardAndCommit);
    assert_eq!(stream.state(), CommitState::Committed);
}

#[test]
fn transient_error_retries_only_before_commit() {
    let mut stream = StreamCommit::new();

    assert_eq!(
        stream.observe_first_event(FirstEventClass::RetryableError),
        CommitDecision::RetryBeforeCommit
    );
    assert_eq!(stream.state(), CommitState::PreCommit);

    assert_eq!(
        stream.observe_first_event(FirstEventClass::Valid),
        CommitDecision::ForwardAndCommit
    );
    assert_eq!(stream.state(), CommitState::Committed);

    assert_eq!(
        stream.observe_first_event(FirstEventClass::RetryableError),
        CommitDecision::ForwardWithoutRetry
    );
}
