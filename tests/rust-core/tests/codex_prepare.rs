use agentproxy_control_protocol::snapshot::CodexConnectionConfig;
use agentproxy_providers::codex::adapter::{CodexAdapter, PrepareError};
use serde_json::json;

fn account() -> CodexConnectionConfig {
    CodexConnectionConfig {
        id: "codex-a".to_owned(),
        access_token: "secret-token".to_owned(),
        workspace_id: Some("workspace-a".to_owned()),
        base_url: "https://chatgpt.com/backend-api/codex".to_owned(),
        max_concurrent: Some(4),
        credential_version: 1,
    }
}

#[test]
fn prepares_native_responses_with_codex_identity_and_compatibility_rules() {
    let input = json!({
        "model": "gpt-5.6-sol-ultra",
        "service_tier": "fast",
        "stream": false,
        "store": true,
        "prompt_cache_key": "session-123",
        "input": [
            {"type":"message","role":"system","content":[{"type":"input_text","text":"policy"}]},
            {"type":"message","role":"user","content":[{"type":"input_text","text":"hello"}]}
        ]
    });

    let prepared = CodexAdapter::prepare("/v1/responses", input, &account()).unwrap();

    assert_eq!(
        prepared.url,
        "https://chatgpt.com/backend-api/codex/responses"
    );
    assert_eq!(
        prepared.headers.get("Authorization").unwrap(),
        "Bearer secret-token"
    );
    assert_eq!(prepared.headers.get("Accept").unwrap(), "text/event-stream");
    assert_eq!(prepared.headers.get("Version").unwrap(), "0.153.2");
    assert_eq!(prepared.headers.get("originator").unwrap(), "codex_cli_rs");
    assert_eq!(
        prepared.headers.get("chatgpt-account-id").unwrap(),
        "workspace-a"
    );
    assert_eq!(prepared.headers.get("session_id").unwrap(), "session-123");
    assert_eq!(prepared.body["model"], "gpt-5.6-sol");
    assert_eq!(prepared.body["reasoning"]["effort"], "max");
    assert_eq!(prepared.body["service_tier"], "priority");
    assert_eq!(prepared.body["stream"], true);
    assert_eq!(prepared.body["store"], false);
    assert_eq!(prepared.body["input"][0]["role"], "developer");
}

#[test]
fn unsupported_native_capabilities_are_rejected_instead_of_silently_stripped() {
    let input = json!({
        "model": "gpt-5.6-sol-ultra",
        "max_output_tokens": 1234,
        "truncation": "auto",
        "user": "client-only",
        "input": []
    });

    let error = match CodexAdapter::prepare("/v1/responses", input, &account()) {
        Ok(_) => panic!("unsupported native capabilities must be rejected"),
        Err(error) => error,
    };

    assert_eq!(
        error,
        PrepareError::UnsupportedCapabilities(vec![
            "max_output_tokens".to_owned(),
            "truncation".to_owned(),
            "user".to_owned(),
        ])
    );
}

#[test]
fn compact_preserves_subpath_and_removes_stream_only_fields() {
    let input = json!({
        "model": "gpt-5.6-luna-max",
        "stream": true,
        "stream_options": {"include_usage": true},
        "client_metadata": {"foo":"bar"},
        "include": ["reasoning.encrypted_content"],
        "store": false
    });

    let prepared = CodexAdapter::prepare("/v1/responses/compact", input, &account()).unwrap();

    assert_eq!(
        prepared.url,
        "https://chatgpt.com/backend-api/codex/responses/compact"
    );
    assert_eq!(prepared.headers.get("Accept").unwrap(), "application/json");
    for key in [
        "stream",
        "stream_options",
        "client_metadata",
        "include",
        "store",
    ] {
        assert!(
            prepared.body.get(key).is_none(),
            "{key} must be removed for compact"
        );
    }
}

#[test]
fn strips_sampling_params_rejected_by_native_codex_responses() {
    let input = json!({
        "model": "gpt-5.6-sol",
        "input": [],
        "temperature": 0.7,
        "top_p": 0.9
    });

    let prepared = CodexAdapter::prepare("/v1/responses", input, &account()).unwrap();

    assert!(prepared.body.get("temperature").is_none());
    assert!(prepared.body.get("top_p").is_none());
}

#[test]
fn reasoning_wire_object_is_allowlisted_and_disable_maps_to_none() {
    let input = json!({
        "model": "gpt-5.6-sol",
        "input": [],
        "reasoning": {
            "enabled": false,
            "max_tokens": 2048,
            "exclude": true,
            "summary": "detailed"
        }
    });

    let prepared = CodexAdapter::prepare("/v1/responses", input, &account()).unwrap();
    let reasoning = prepared.body["reasoning"]
        .as_object()
        .expect("reasoning object");

    assert_eq!(reasoning.get("effort"), Some(&json!("none")));
    assert_eq!(reasoning.get("summary"), Some(&json!("detailed")));
    assert_eq!(
        reasoning.len(),
        2,
        "only effort/summary may reach native Codex"
    );
}

#[test]
fn explicit_reasoning_effort_beats_enabled_false_and_extra_keys_are_stripped() {
    let input = json!({
        "model": "gpt-5.6-sol-high",
        "input": [],
        "reasoning": {
            "enabled": false,
            "effort": "low",
            "max_tokens": 1024
        }
    });

    let prepared = CodexAdapter::prepare("/v1/responses", input, &account()).unwrap();
    let reasoning = prepared.body["reasoning"]
        .as_object()
        .expect("reasoning object");

    assert_eq!(reasoning.get("effort"), Some(&json!("high")));
    assert_eq!(reasoning.len(), 1);
}

#[test]
fn native_custom_tools_and_tool_choice_are_preserved() {
    let tools = json!([
        {
            "type": "custom",
            "name": "apply_patch",
            "format": {"type": "grammar", "syntax": "lark", "definition": "start: \"patch\""}
        },
        {
            "type": "function",
            "name": "read_file",
            "parameters": {"type": "object", "properties": {}}
        }
    ]);
    let input = json!({
        "model": "gpt-5.6-sol",
        "input": [],
        "tools": tools,
        "tool_choice": "required"
    });

    let prepared = CodexAdapter::prepare("/v1/responses", input, &account()).unwrap();

    assert_eq!(prepared.body["tools"], tools);
    assert_eq!(prepared.body["tool_choice"], "required");
}
