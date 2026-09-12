use std::collections::BTreeMap;

use agentproxy_control_protocol::snapshot::CodexConnectionConfig;
use serde_json::{Map, Value};

const DEFAULT_CODEX_CLIENT_VERSION: &str = "0.153.2";
const CODEX_ORIGINATOR: &str = "codex_cli_rs";
const DEFAULT_CODEX_INSTRUCTIONS: &str = "Follow the developer instructions in the conversation.";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PrepareError {
    InvalidBody,
    UnsupportedEndpoint,
    MissingAccessToken,
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
        mut body: Value,
        account: &CodexConnectionConfig,
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

        Ok(PreparedRequest {
            url,
            headers,
            body,
            compact,
        })
    }
}

fn responses_subpath(endpoint_path: &str) -> Option<String> {
    let normalized = endpoint_path.trim_end_matches('/');
    let lower = normalized.to_ascii_lowercase();
    if lower == "responses" || lower.ends_with("/responses") {
        return Some(String::new());
    }

    if let Some(index) = lower.rfind("/responses/") {
        return Some(normalized[index + "/responses".len()..].to_owned());
    }

    if lower.starts_with("responses/") {
        return Some(normalized["responses".len()..].to_owned());
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
