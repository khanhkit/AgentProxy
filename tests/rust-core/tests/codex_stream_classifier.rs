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
