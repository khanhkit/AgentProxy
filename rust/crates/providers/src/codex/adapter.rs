use std::collections::BTreeMap;

use agentproxy_control_protocol::snapshot::CodexConnectionConfig;
use serde_json::{Map, Value};

pub const CODEX_NATIVE_WIRE_CONTRACT_VERSION: u32 = 1;
pub const SAFE_CODEX_CLIENT_HEADER_NAMES: [&str; 12] = [
    "version",
    "openai-beta",
    "x-codex-beta-features",
    "user-agent",
    "x-codex-session-id",
    "session-id",
    "thread-id",
    "thread_id",
    "x-client-request-id",
    "x-codex-installation-id",
    "x-codex-window-id",
    "x-codex-turn-metadata",
];
pub const MANDATORY_CODEX_GATEWAY_HEADER_NAMES: [&str; 6] = [
    "content-type",
    "authorization",
    "accept",
    "originator",
    "chatgpt-account-id",
    "session_id",
];
pub const FORBIDDEN_CODEX_CLIENT_HEADER_NAMES: [&str; 18] = [
    "authorization",
    "content-type",
    "accept",
    "host",
    "content-length",
    "connection",
    "proxy-authorization",
    "proxy-connection",
    "transfer-encoding",
    "te",
    "upgrade",
    "originator",
    "chatgpt-account-id",
    "session_id",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-codex-turn-state",
];

const DEFAULT_CODEX_CLIENT_VERSION: &str = "0.153.2";
const CODEX_ORIGINATOR: &str = "codex_cli_rs";
const DEFAULT_CODEX_INSTRUCTIONS: &str = "Follow the developer instructions in the conversation.";
const MAX_PRESERVED_CLIENT_HEADERS_BYTES: usize = 8 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PrepareError {
    InvalidBody,
    UnsupportedEndpoint,
    MissingAccessToken,
    InvalidClientHeader(String),
    UnsupportedCapabilities(Vec<String>),
}

#[derive(Clone, PartialEq)]
pub struct PreparedRequest {
    pub url: String,
    pub headers: BTreeMap<String, String>,
    pub body: Value,
    pub compact: bool,
}

pub struct CodexAdapter;

impl CodexAdapter {
    pub fn prepare(
        endpoint_path: &str,
        body: Value,
        account: &CodexConnectionConfig,
    ) -> Result<PreparedRequest, PrepareError> {
        Self::prepare_with_client_headers(endpoint_path, body, account, &BTreeMap::new())
    }

    pub fn prepare_with_client_headers(
        endpoint_path: &str,
        mut body: Value,
        account: &CodexConnectionConfig,
        client_headers: &BTreeMap<String, String>,
    ) -> Result<PreparedRequest, PrepareError> {
        if account.access_token.trim().is_empty() {
            return Err(PrepareError::MissingAccessToken);
        }

        let subpath = responses_subpath(endpoint_path).ok_or(PrepareError::UnsupportedEndpoint)?;
        let compact = subpath.eq_ignore_ascii_case("/compact");
        let url = responses_url(&account.base_url, &subpath);

        let Some(record) = body.as_object_mut() else {
            return Err(PrepareError::InvalidBody);
        };

        if compact {
            for key in [
                "stream",
                "stream_options",
                "client_metadata",
                "include",
                "store",
            ] {
                record.remove(key);
            }
        } else {
            record.insert("stream".to_owned(), Value::Bool(true));
            record.insert("store".to_owned(), Value::Bool(false));
        }

        normalize_service_tier(record);
        normalize_messages(record);
        convert_system_to_developer(record);
        normalize_reasoning_alias(record);
        normalize_reasoning_effort_field(record);

        let unsupported = unsupported_capabilities(record);
        if !unsupported.is_empty() {
            return Err(PrepareError::UnsupportedCapabilities(unsupported));
        }

        for key in [
            "messages",
            "prompt",
            "max_tokens",
            "max_output_tokens",
            "truncation",
            "background",
            "prompt_cache_retention",
            "safety_identifier",
            "user",
            "reasoning_effort",
            "_nativeCodexPassthrough",
        ] {
            record.remove(key);
        }

        if !compact {
            let needs_instructions = record
                .get("instructions")
                .and_then(Value::as_str)
                .is_none_or(|value| value.trim().is_empty());
            if needs_instructions {
                record.insert(
                    "instructions".to_owned(),
                    Value::String(DEFAULT_CODEX_INSTRUCTIONS.to_owned()),
                );
            }
        }

        let mut headers = BTreeMap::from([
            ("Content-Type".to_owned(), "application/json".to_owned()),
            (
                "Authorization".to_owned(),
                format!("Bearer {}", account.access_token),
            ),
            (
                "Accept".to_owned(),
                if compact {
                    "application/json".to_owned()
                } else {
                    "text/event-stream".to_owned()
                },
            ),
            (
                "Version".to_owned(),
                DEFAULT_CODEX_CLIENT_VERSION.to_owned(),
            ),
            (
                "Openai-Beta".to_owned(),
                "responses=experimental".to_owned(),
            ),
            (
                "X-Codex-Beta-Features".to_owned(),
                "responses_websockets".to_owned(),
            ),
            (
                "User-Agent".to_owned(),
                format!("codex-cli/{DEFAULT_CODEX_CLIENT_VERSION} (Windows 10.0.26200; x64)"),
            ),
            ("originator".to_owned(), CODEX_ORIGINATOR.to_owned()),
        ]);

        if let Some(workspace_id) = account
            .workspace_id
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            headers.insert("chatgpt-account-id".to_owned(), workspace_id.to_owned());
        }

        if let Some(session_id) = prompt_cache_session_id(record, account.workspace_id.as_deref()) {
            headers.insert("session_id".to_owned(), session_id);
        }

        apply_safe_client_headers(&mut headers, client_headers)?;

        Ok(PreparedRequest {
            url,
            headers,
            body,
            compact,
        })
    }
}

fn apply_safe_client_headers(
    headers: &mut BTreeMap<String, String>,
    client_headers: &BTreeMap<String, String>,
) -> Result<(), PrepareError> {
    let mut preserved = BTreeMap::<&'static str, &str>::new();
    let mut total_bytes = 0usize;

    for (name, value) in client_headers {
        let Some(canonical) = canonical_safe_client_header_name(name) else {
            continue;
        };

        if preserved.insert(canonical, value.as_str()).is_some() {
            return Err(PrepareError::InvalidClientHeader(name.clone()));
        }

        if value.is_empty()
            || !value
                .bytes()
                .all(|byte| byte == b'\t' || (b' '..=b'~').contains(&byte))
        {
            return Err(PrepareError::InvalidClientHeader(name.clone()));
        }

        total_bytes = total_bytes
            .saturating_add(canonical.len())
            .saturating_add(value.len());
        if total_bytes > MAX_PRESERVED_CLIENT_HEADERS_BYTES {
            return Err(PrepareError::InvalidClientHeader(name.clone()));
        }
    }

    for (name, value) in preserved {
        headers.insert(name.to_owned(), value.to_owned());
    }

    Ok(())
}

fn canonical_safe_client_header_name(name: &str) -> Option<&'static str> {
    match name.to_ascii_lowercase().as_str() {
        "version" => Some("Version"),
        "openai-beta" => Some("Openai-Beta"),
        "x-codex-beta-features" => Some("X-Codex-Beta-Features"),
        "user-agent" => Some("User-Agent"),
        "x-codex-session-id" => Some("X-Codex-Session-Id"),
        "session-id" => Some("Session-Id"),
        "thread-id" => Some("Thread-Id"),
        "thread_id" => Some("thread_id"),
        "x-client-request-id" => Some("X-Client-Request-Id"),
        "x-codex-installation-id" => Some("X-Codex-Installation-Id"),
        "x-codex-window-id" => Some("X-Codex-Window-Id"),
        "x-codex-turn-metadata" => Some("X-Codex-Turn-Metadata"),
        _ => None,
    }
}

fn responses_subpath(endpoint_path: &str) -> Option<String> {
    let normalized = endpoint_path.trim().trim_end_matches('/');
    let lower = normalized.to_ascii_lowercase();

    if lower == "responses" || lower.ends_with("/responses") {
        return Some(String::new());
    }

    if lower == "responses/compact" || lower.ends_with("/responses/compact") {
        return Some("/compact".to_owned());
    }

    None
}

fn responses_url(base_url: &str, subpath: &str) -> String {
    let base = base_url.trim_end_matches('/');
    if base.ends_with("/responses") {
        format!("{base}{subpath}")
    } else {
        format!("{base}/responses{subpath}")
    }
}

fn normalize_service_tier(record: &mut Map<String, Value>) {
    if record
        .get("service_tier")
        .and_then(Value::as_str)
        .is_some_and(|value| value.trim().eq_ignore_ascii_case("fast"))
    {
        record.insert(
            "service_tier".to_owned(),
            Value::String("priority".to_owned()),
        );
    }
}

fn normalize_messages(record: &mut Map<String, Value>) {
    if record.get("input").is_some() {
        return;
    }

    if let Some(messages) = record.get("messages").and_then(Value::as_array).cloned() {
        let input = messages
            .into_iter()
            .filter_map(|message| {
                let message = message.as_object()?;
                let role = message
                    .get("role")
                    .and_then(Value::as_str)
                    .unwrap_or("user");
                let content = match message.get("content") {
                    Some(Value::String(text)) => vec![serde_json::json!({
                        "type": "input_text",
                        "text": text,
                    })],
                    Some(Value::Array(parts)) => parts.clone(),
                    _ => Vec::new(),
                };
                Some(serde_json::json!({
                    "type": "message",
                    "role": role,
                    "content": content,
                }))
            })
            .collect();
        record.insert("input".to_owned(), Value::Array(input));
    } else if let Some(prompt) = record.get("prompt").and_then(Value::as_str) {
        if !prompt.trim().is_empty() {
            record.insert(
                "input".to_owned(),
                serde_json::json!([{
                    "type": "message",
                    "role": "user",
                    "content": [{"type":"input_text","text":prompt}],
                }]),
            );
        }
    }
}

fn convert_system_to_developer(record: &mut Map<String, Value>) {
    let Some(input) = record.get_mut("input").and_then(Value::as_array_mut) else {
        return;
    };

    for item in input {
        let Some(message) = item.as_object_mut() else {
            continue;
        };
        let role = message
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let item_type = message
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if role == "system" && (item_type.is_empty() || item_type == "message") {
            message.insert("role".to_owned(), Value::String("developer".to_owned()));
        }
    }
}

fn normalize_reasoning_alias(record: &mut Map<String, Value>) {
    let Some(model) = record
        .get("model")
        .and_then(Value::as_str)
        .map(str::to_owned)
    else {
        return;
    };
    let Some((base_model, effort)) = split_reasoning_suffix(&model) else {
        return;
    };

    record.insert("model".to_owned(), Value::String(base_model));
    let reasoning = record
        .entry("reasoning".to_owned())
        .or_insert_with(|| Value::Object(Map::new()));
    if !reasoning.is_object() {
        *reasoning = Value::Object(Map::new());
    }
    if let Some(reasoning) = reasoning.as_object_mut() {
        reasoning.insert(
            "effort".to_owned(),
            Value::String(if effort == "ultra" { "max" } else { effort }.to_owned()),
        );
    }
}

fn normalize_reasoning_effort_field(record: &mut Map<String, Value>) {
    let Some(effort) = record
        .get("reasoning_effort")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
    else {
        return;
    };

    let reasoning = record
        .entry("reasoning".to_owned())
        .or_insert_with(|| Value::Object(Map::new()));
    if !reasoning.is_object() {
        *reasoning = Value::Object(Map::new());
    }
    if let Some(reasoning) = reasoning.as_object_mut() {
        reasoning.insert("effort".to_owned(), Value::String(effort));
    }
}

fn unsupported_capabilities(record: &Map<String, Value>) -> Vec<String> {
    let mut unsupported = [
        "max_tokens",
        "max_output_tokens",
        "truncation",
        "background",
        "prompt_cache_retention",
        "safety_identifier",
        "user",
    ]
    .into_iter()
    .filter(|key| record.get(*key).is_some_and(|value| !value.is_null()))
    .map(str::to_owned)
    .collect::<Vec<_>>();

    if record.get("reasoning_effort").is_some_and(|value| {
        !value.is_null() && value.as_str().is_none_or(|effort| effort.trim().is_empty())
    }) {
        unsupported.push("reasoning_effort".to_owned());
    }

    unsupported
}

fn split_reasoning_suffix(model: &str) -> Option<(String, &'static str)> {
    for (suffix, effort) in [
        ("-ultra", "ultra"),
        ("-max", "max"),
        ("-xhigh", "xhigh"),
        ("-high", "high"),
        ("-medium", "medium"),
        ("-low", "low"),
        ("-none", "none"),
    ] {
        if let Some(base) = model.strip_suffix(suffix) {
            if suffix == "-ultra" && base == "gpt-5.6-luna" {
                return None;
            }
            return Some((base.to_owned(), effort));
        }
    }
    None
}

fn prompt_cache_session_id(
    record: &Map<String, Value>,
    workspace_id: Option<&str>,
) -> Option<String> {
    record
        .get("prompt_cache_key")
        .and_then(Value::as_str)
        .and_then(normalize_session_id)
        .or_else(|| workspace_id.and_then(normalize_session_id))
}

fn normalize_session_id(value: &str) -> Option<String> {
    let normalized = value.trim();
    if normalized.is_empty() || normalized.len() > 200 {
        return None;
    }
    if normalized
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
    {
        Some(normalized.to_owned())
    } else {
        None
    }
}

#[cfg(test)]
mod capability_tests {
    use super::*;

    fn account() -> CodexConnectionConfig {
        CodexConnectionConfig {
            id: "capability-test".to_owned(),
            access_token: "token".to_owned(),
            workspace_id: None,
            base_url: "https://example.invalid/v1".to_owned(),
            max_concurrent: None,
            credential_version: 1,
        }
    }

    #[test]
    fn unsupported_requested_capabilities_are_not_silently_stripped() {
        let unsupported = [
            ("max_tokens", serde_json::json!(100)),
            ("max_output_tokens", serde_json::json!(100)),
            ("truncation", serde_json::json!("auto")),
            ("background", serde_json::json!(true)),
            ("prompt_cache_retention", serde_json::json!("24h")),
            ("safety_identifier", serde_json::json!("user-123")),
            ("user", serde_json::json!("user-123")),
        ];

        for (field, value) in unsupported {
            let mut body = serde_json::json!({"model":"gpt-test","input":"hello"});
            body.as_object_mut()
                .unwrap()
                .insert(field.to_owned(), value);
            assert!(
                CodexAdapter::prepare("/v1/responses", body, &account()).is_err(),
                "{field} must not be silently stripped"
            );
        }

        let body = serde_json::json!({
            "model":"gpt-test",
            "input":"hello",
            "background": true,
            "max_output_tokens": 42,
            "user": "user-123"
        });
        assert!(CodexAdapter::prepare("/v1/responses", body, &account()).is_err());
    }

    #[test]
    fn reasoning_effort_alias_is_preserved_as_reasoning_effort() {
        let body = serde_json::json!({
            "model":"gpt-test",
            "input":"hello",
            "reasoning_effort":"high"
        });
        let prepared = CodexAdapter::prepare("/v1/responses", body, &account())
            .expect("reasoning_effort is a supported translatable alias");
        assert_eq!(prepared.body["reasoning"]["effort"], "high");
        assert!(prepared.body.get("reasoning_effort").is_none());
    }
}
