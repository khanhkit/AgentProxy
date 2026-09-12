#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodexPrecommitClass {
    Ignore,
    Valid,
    RetryableError,
    FatalError,
}

const TRANSIENT_ERROR_PATTERNS: [&str; 3] = [
    "selected model is at capacity",
    "server_is_overloaded",
    "service_unavailable_error",
];

pub fn classify_precommit_sse_event(event: &[u8]) -> CodexPrecommitClass {
    let raw = String::from_utf8_lossy(event);
    if raw
        .lines()
        .all(|line| line.trim().is_empty() || line.trim_start().starts_with(':'))
    {
        return CodexPrecommitClass::Ignore;
    }

    let text = raw.to_ascii_lowercase();
    if TRANSIENT_ERROR_PATTERNS
        .iter()
        .any(|pattern| text.contains(pattern))
    {
        return CodexPrecommitClass::RetryableError;
    }

    if text
        .lines()
        .any(|line| line.trim().eq_ignore_ascii_case("event: error"))
    {
        return CodexPrecommitClass::FatalError;
    }

    CodexPrecommitClass::Valid
}
