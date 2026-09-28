#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodexPrecommitClass {
    Ignore,
    Valid,
    TerminalSuccess,
    RetryableError,
    FatalError,
}

const TRANSIENT_ERROR_CODES: [&str; 6] = [
    "server_is_overloaded",
    "service_unavailable_error",
    "rate_limit_exceeded",
    "insufficient_quota",
    "quota_exceeded",
    "temporarily_unavailable",
];

const TRANSIENT_ERROR_MESSAGES: [&str; 2] = [
    "selected model is at capacity",
    "service temporarily unavailable",
];

pub fn classify_precommit_sse_event(event: &[u8]) -> CodexPrecommitClass {
    let raw = String::from_utf8_lossy(event);
    let parsed = parse_sse_fields(&raw);

    if parsed.event.is_none() && parsed.data.is_empty() {
        return CodexPrecommitClass::Ignore;
    }

    if parsed.data.trim() == "[DONE]" {
        return CodexPrecommitClass::TerminalSuccess;
    }

    let json = serde_json::from_str::<serde_json::Value>(parsed.data.trim()).ok();
    let json_type = json
        .as_ref()
        .and_then(|value| value.get("type"))
        .and_then(serde_json::Value::as_str);
    let header_event = parsed.event.as_deref();

    // Any structured failure signal wins over contradictory success/commit
    // metadata. Providers can evolve fields independently, and an explicit
    // SSE error event must never be masked by a benign JSON type.
    if is_structured_failure(header_event, json_type, json.as_ref()) {
        return if structured_error_is_retryable(json.as_ref()) {
            CodexPrecommitClass::RetryableError
        } else {
            CodexPrecommitClass::FatalError
        };
    }

    if is_terminal_success(header_event, json_type, json.as_ref()) {
        return CodexPrecommitClass::TerminalSuccess;
    }

    if header_event.is_some_and(is_valid_commit_event)
        || json_type.is_some_and(is_valid_commit_event)
    {
        return CodexPrecommitClass::Valid;
    }

    if json.is_some() {
        // A structured event with an unknown type is control-plane/protocol
        // data until proven otherwise. Do not commit the downstream stream
        // merely because it was carried in HTTP 200.
        return CodexPrecommitClass::Ignore;
    }

    // Compatibility fallback for providers that emit non-JSON SSE. Text
    // heuristics are deliberately applied only after structured parsing fails,
    // so user/content fields inside valid JSON cannot trigger failover.
    let fallback = parsed.data.to_ascii_lowercase();
    if TRANSIENT_ERROR_MESSAGES
        .iter()
        .any(|pattern| fallback.contains(pattern))
        || TRANSIENT_ERROR_CODES
            .iter()
            .any(|code| fallback.contains(code))
    {
        return CodexPrecommitClass::RetryableError;
    }

    if parsed.event.as_deref() == Some("error") {
        return CodexPrecommitClass::FatalError;
    }

    match parsed.event.as_deref() {
        Some(event_name) if is_valid_commit_event(event_name) => CodexPrecommitClass::Valid,
        Some(_) => CodexPrecommitClass::Ignore,
        None if !parsed.data.trim().is_empty() => CodexPrecommitClass::Valid,
        None => CodexPrecommitClass::Ignore,
    }
}

struct ParsedSseFields {
    event: Option<String>,
    data: String,
}

fn parse_sse_fields(raw: &str) -> ParsedSseFields {
    let mut event = None;
    let mut data_lines = Vec::new();

    for line in raw.lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() || line.starts_with(':') {
            continue;
        }

        let (field, value) = line
            .split_once(':')
            .map(|(field, value)| (field, value.strip_prefix(' ').unwrap_or(value)))
            .unwrap_or((line, ""));

        match field {
            "event" if event.is_none() => event = Some(value.trim().to_ascii_lowercase()),
            "data" => data_lines.push(value),
            _ => {}
        }
    }

    ParsedSseFields {
        event,
        data: data_lines.join("\n"),
    }
}

fn is_terminal_success(
    header_event: Option<&str>,
    json_type: Option<&str>,
    json: Option<&serde_json::Value>,
) -> bool {
    header_event == Some("response.completed")
        || json_type == Some("response.completed")
        || json
            .and_then(|value| value.get("response"))
            .and_then(|response| response.get("status"))
            .and_then(serde_json::Value::as_str)
            .is_some_and(|status| status.eq_ignore_ascii_case("completed"))
}

fn is_structured_failure(
    header_event: Option<&str>,
    json_type: Option<&str>,
    json: Option<&serde_json::Value>,
) -> bool {
    if [header_event, json_type]
        .into_iter()
        .flatten()
        .any(|event_type| {
            matches!(
                event_type,
                "error" | "response.failed" | "response.incomplete"
            )
        })
    {
        return true;
    }

    let Some(json) = json else {
        return false;
    };

    if json.get("error").is_some_and(|error| !error.is_null()) {
        return true;
    }

    json.get("response")
        .and_then(|response| response.get("status"))
        .and_then(serde_json::Value::as_str)
        .is_some_and(|status| {
            matches!(
                status.to_ascii_lowercase().as_str(),
                "failed" | "incomplete" | "cancelled"
            )
        })
}

fn structured_error_is_retryable(json: Option<&serde_json::Value>) -> bool {
    let Some(json) = json else {
        return false;
    };

    error_strings(json, "code").any(|code| {
        TRANSIENT_ERROR_CODES
            .iter()
            .any(|known| code.eq_ignore_ascii_case(known))
    }) || error_strings(json, "message").any(|message| {
        let message = message.to_ascii_lowercase();
        TRANSIENT_ERROR_MESSAGES
            .iter()
            .any(|pattern| message.contains(pattern))
    })
}

fn error_strings<'a>(
    json: &'a serde_json::Value,
    field: &'static str,
) -> impl Iterator<Item = &'a str> {
    [
        json.get(field),
        json.get("error").and_then(|error| error.get(field)),
        json.get("response")
            .and_then(|response| response.get("error"))
            .and_then(|error| error.get(field)),
    ]
    .into_iter()
    .flatten()
    .filter_map(serde_json::Value::as_str)
}

fn is_valid_commit_event(event_type: &str) -> bool {
    matches!(event_type, "response.created" | "response.in_progress")
        || [
            "response.output_item.",
            "response.content_part.",
            "response.output_text.",
            "response.refusal.",
            "response.function_call_arguments.",
            "response.file_search_call.",
            "response.web_search_call.",
            "response.code_interpreter_call.",
            "response.reasoning_text.",
            "response.reasoning_summary_part.",
            "response.reasoning_summary_text.",
            "response.mcp_call.",
            "response.mcp_call_arguments.",
            "response.mcp_list_tools.",
        ]
        .iter()
        .any(|prefix| event_type.starts_with(prefix))
}
