use agentproxy_control_protocol::snapshot::CodexConnectionConfig;
use agentproxy_providers::codex::adapter::CodexAdapter;
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
        "max_output_tokens": 1234,
        "truncation": "auto",
        "user": "client-only",
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
    assert!(prepared.body.get("max_output_tokens").is_none());
    assert!(prepared.body.get("truncation").is_none());
    assert!(prepared.body.get("user").is_none());
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
