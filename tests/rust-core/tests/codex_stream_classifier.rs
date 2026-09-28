use agentproxy_providers::codex::stream_classifier::{
    classify_precommit_sse_event, CodexPrecommitClass,
};

#[test]
fn response_created_is_valid_before_any_output_text_delta() {
    let event = b"event: response.created\ndata: {\"type\":\"response.created\",\"response\":{\"id\":\"r1\"}}\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::Valid
    );
}

#[test]
fn model_at_capacity_error_is_retryable_before_commit() {
    let event =
        b"data: {\"error\":{\"message\":\"Selected model is at capacity. Try again.\"}}\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::RetryableError
    );
}

#[test]
fn overloaded_and_service_unavailable_codes_are_retryable() {
    for event in [
        b"data: {\"type\":\"error\",\"code\":\"server_is_overloaded\"}\n\n".as_slice(),
        b"data: {\"type\":\"error\",\"code\":\"service_unavailable_error\"}\n\n".as_slice(),
    ] {
        assert_eq!(
            classify_precommit_sse_event(event),
            CodexPrecommitClass::RetryableError
        );
    }
}

#[test]
fn non_transient_structured_error_is_fatal_before_commit() {
    let event = b"event: error\ndata: {\"type\":\"error\",\"code\":\"invalid_request\",\"message\":\"bad input\"}\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::FatalError
    );
}

#[test]
fn keepalive_comment_does_not_commit_stream() {
    assert_eq!(
        classify_precommit_sse_event(b": ping\n\n"),
        CodexPrecommitClass::Ignore
    );
}

#[test]
fn user_output_text_containing_error_words_is_still_valid() {
    let event = b"event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"the string server_is_overloaded appeared in a log\"}\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::Valid
    );
}

#[test]
fn response_failed_with_transient_code_is_retryable() {
    let event = b"event: response.failed\ndata: {\"type\":\"response.failed\",\"response\":{\"status\":\"failed\",\"error\":{\"code\":\"server_is_overloaded\",\"message\":\"try later\"}}}\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::RetryableError
    );
}

#[test]
fn response_failed_with_unknown_code_is_fatal_not_valid() {
    let event = b"event: response.failed\ndata: {\"type\":\"response.failed\",\"response\":{\"status\":\"failed\",\"error\":{\"code\":\"provider_policy_failure\"}}}\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::FatalError
    );
}

#[test]
fn response_completed_is_explicit_terminal_success() {
    let event = b"event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\"}}\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::TerminalSuccess
    );
}

#[test]
fn unknown_structured_control_event_does_not_commit() {
    let event = b"event: response.provider_control\ndata: {\"type\":\"response.provider_control\",\"state\":\"warmup\"}\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::Ignore
    );
}

#[test]
fn rate_limit_semantic_error_inside_http_200_is_retryable() {
    let event = b"event: error\ndata: {\"type\":\"error\",\"error\":{\"code\":\"rate_limit_exceeded\",\"message\":\"quota exhausted\"}}\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::RetryableError
    );
}

#[test]
fn malformed_non_error_json_does_not_commit_unknown_control_data() {
    let event = b"event: response.unknown\ndata: not-json\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::Ignore
    );
}

#[test]
fn explicit_error_event_cannot_be_masked_by_benign_json_type() {
    let event =
        b"event: error\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"benign\"}\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::FatalError
    );
}

#[test]
fn response_failed_event_cannot_be_masked_by_completed_status() {
    let event = b"event: response.failed\ndata: {\"type\":\"response.failed\",\"response\":{\"status\":\"completed\"}}\n\n";

    assert_eq!(
        classify_precommit_sse_event(event),
        CodexPrecommitClass::FatalError
    );
}
