use std::sync::atomic::{AtomicU64, Ordering};

use axum::{
    body::Body,
    http::{header, StatusCode},
    response::Response,
};
use serde_json::{json, Value};

const MAX_PUBLIC_ERROR_MESSAGE_BYTES: usize = 512;
const MAX_PUBLIC_ERROR_TOKEN_BYTES: usize = 128;
static NEXT_PUBLIC_ERROR_ID: AtomicU64 = AtomicU64::new(1);

pub(crate) fn json_error(status: StatusCode, message: &str) -> Response {
    let error_id = next_public_error_id();
    json_error_with_id(
        status,
        message,
        "agentproxy_gateway_error",
        None,
        None,
        &error_id,
    )
}

pub(crate) fn json_error_with_diagnostic(
    status: StatusCode,
    message: &str,
    context: &str,
    account_id: Option<&str>,
    detail: &str,
) -> Response {
    let error_id = next_public_error_id();
    log_private_diagnostic(&error_id, context, account_id, detail);
    json_error_with_id(
        status,
        message,
        "agentproxy_gateway_error",
        None,
        None,
        &error_id,
    )
}

pub(crate) fn provider_error_response(
    status: StatusCode,
    body: &[u8],
    account_id: &str,
) -> Response {
    let error_id = next_public_error_id();
    let parsed = serde_json::from_slice::<Value>(body).ok();
    let source = parsed
        .as_ref()
        .and_then(|root| root.get("error"))
        .or(parsed.as_ref());

    let message = source
        .and_then(|value| value.get("message"))
        .and_then(Value::as_str)
        .map(|value| bounded(value, MAX_PUBLIC_ERROR_MESSAGE_BYTES))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "upstream provider request failed".to_owned());
    let error_type = source
        .and_then(|value| value.get("type"))
        .and_then(Value::as_str)
        .map(|value| bounded(value, MAX_PUBLIC_ERROR_TOKEN_BYTES))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "upstream_provider_error".to_owned());
    let code = source
        .and_then(|value| value.get("code"))
        .and_then(Value::as_str)
        .map(|value| bounded(value, MAX_PUBLIC_ERROR_TOKEN_BYTES))
        .filter(|value| !value.is_empty());
    let param = source
        .and_then(|value| value.get("param"))
        .and_then(Value::as_str)
        .map(|value| bounded(value, MAX_PUBLIC_ERROR_TOKEN_BYTES))
        .filter(|value| !value.is_empty());

    log_private_diagnostic(
        &error_id,
        "codex_provider_error",
        Some(account_id),
        &format!(
            "status={} provider_body_bytes={}",
            status.as_u16(),
            body.len()
        ),
    );

    json_error_with_id(
        status,
        &message,
        &error_type,
        code.as_deref(),
        param.as_deref(),
        &error_id,
    )
}

fn json_error_with_id(
    status: StatusCode,
    message: &str,
    error_type: &str,
    code: Option<&str>,
    param: Option<&str>,
    error_id: &str,
) -> Response {
    let mut error = serde_json::Map::from_iter([
        (
            "message".to_owned(),
            Value::String(bounded(message, MAX_PUBLIC_ERROR_MESSAGE_BYTES)),
        ),
        (
            "type".to_owned(),
            Value::String(bounded(error_type, MAX_PUBLIC_ERROR_TOKEN_BYTES)),
        ),
    ]);
    if let Some(code) = code {
        error.insert(
            "code".to_owned(),
            Value::String(bounded(code, MAX_PUBLIC_ERROR_TOKEN_BYTES)),
        );
    }
    if let Some(param) = param {
        error.insert(
            "param".to_owned(),
            Value::String(bounded(param, MAX_PUBLIC_ERROR_TOKEN_BYTES)),
        );
    }

    let body = json!({
        "error": Value::Object(error),
        "error_id": error_id,
    });
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(body.to_string()))
        .expect("static JSON error response headers are valid")
}

fn next_public_error_id() -> String {
    let id = NEXT_PUBLIC_ERROR_ID.fetch_add(1, Ordering::Relaxed);
    format!("apx-{id:016x}")
}

fn bounded(value: &str, max_bytes: usize) -> String {
    let mut output = String::with_capacity(value.len().min(max_bytes));
    for ch in value.chars() {
        let normalized = if ch.is_control() { ' ' } else { ch };
        if output.len().saturating_add(normalized.len_utf8()) > max_bytes {
            break;
        }
        output.push(normalized);
    }
    output
}

fn log_private_diagnostic(error_id: &str, context: &str, account_id: Option<&str>, detail: &str) {
    let record = json!({
        "event": "agentproxy_private_error",
        "error_id": error_id,
        "context": context,
        "account_id": account_id,
        "detail": detail,
    });
    eprintln!("{record}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_sanitizer_keeps_only_allowlisted_bounded_fields() {
        let body = br#"{
            "error": {
                "message": "bad input",
                "type": "invalid_request_error",
                "code": "bad_input",
                "param": "input",
                "token_hash": "SECRET_CANARY",
                "extension": {"api_key":"SECRET_CANARY"}
            }
        }"#;

        let response = provider_error_response(StatusCode::BAD_REQUEST, body, "internal-a");
        let _ = response;
    }

    #[test]
    fn bounded_strings_are_byte_capped_and_control_characters_are_normalized() {
        assert_eq!(bounded(&"x".repeat(600), 512).len(), 512);
        assert_eq!(bounded("line1\nline2\tsecret", 64), "line1 line2 secret");
        assert!(bounded(&"🙂".repeat(200), 128).len() <= 128);
    }
}
