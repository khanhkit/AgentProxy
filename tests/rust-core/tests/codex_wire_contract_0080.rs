use std::collections::BTreeMap;

use agentproxy_control_protocol::snapshot::CodexConnectionConfig;
use agentproxy_providers::codex::adapter::{
    CodexAdapter, PrepareError, CODEX_NATIVE_WIRE_CONTRACT_VERSION,
    FORBIDDEN_CODEX_CLIENT_HEADER_NAMES, MANDATORY_CODEX_GATEWAY_HEADER_NAMES,
    SAFE_CODEX_CLIENT_HEADER_NAMES,
};
use serde_json::{json, Value};

fn account() -> CodexConnectionConfig {
    CodexConnectionConfig {
        id: "codex-wire".to_owned(),
        access_token: "secret-token".to_owned(),
        workspace_id: Some("workspace-a".to_owned()),
        base_url: "https://chatgpt.com/backend-api/codex".to_owned(),
        max_concurrent: Some(2),
        credential_version: 1,
    }
}

fn fixture() -> Value {
    serde_json::from_str(include_str!("../fixtures/codex-native-wire-v1.json"))
        .expect("wire fixture JSON")
}

fn string_map(value: &Value) -> BTreeMap<String, String> {
    value
        .as_object()
        .expect("fixture object")
        .iter()
        .map(|(key, value)| {
            (
                key.clone(),
                value.as_str().expect("fixture string").to_owned(),
            )
        })
        .collect()
}

fn string_vec(value: &Value) -> Vec<String> {
    value
        .as_array()
        .expect("fixture array")
        .iter()
        .map(|value| value.as_str().expect("fixture string").to_owned())
        .collect()
}

fn normalized_names<I, S>(values: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut values = values
        .into_iter()
        .map(|value| value.as_ref().to_ascii_lowercase())
        .collect::<Vec<_>>();
    values.sort();
    values
}

#[test]
fn v1_fixture_header_sets_are_explicit_and_exhaustive() {
    let fixture = fixture();
    assert_eq!(
        fixture["contract_version"].as_u64(),
        Some(u64::from(CODEX_NATIVE_WIRE_CONTRACT_VERSION))
    );

    assert_eq!(
        normalized_names(string_vec(&fixture["safe_preserved_header_names"])),
        normalized_names(SAFE_CODEX_CLIENT_HEADER_NAMES),
        "fixture and implementation safe-preserve sets must change together"
    );
    assert_eq!(
        normalized_names(string_vec(&fixture["gateway_owned_header_names"])),
        normalized_names(MANDATORY_CODEX_GATEWAY_HEADER_NAMES),
        "fixture and implementation gateway-owned sets must change together"
    );
    assert_eq!(
        normalized_names(string_vec(&fixture["forbidden_header_names"])),
        normalized_names(FORBIDDEN_CODEX_CLIENT_HEADER_NAMES),
        "fixture and implementation forbidden sets must change together"
    );

    for header in fixture["captured_client_headers"]
        .as_object()
        .expect("captured client headers")
        .keys()
    {
        assert!(
            SAFE_CODEX_CLIENT_HEADER_NAMES
                .iter()
                .any(|allowed| allowed.eq_ignore_ascii_case(header)),
            "captured required client header {header} is not represented in the v1 safe-preserve contract"
        );
    }
}

#[test]
fn v1_fixture_preserves_safe_headers_and_rejects_forbidden_overrides() {
    let fixture = fixture();
    let mut client_headers = string_map(&fixture["captured_client_headers"]);
    client_headers.extend(string_map(&fixture["forbidden_client_headers"]));

    let prepared = CodexAdapter::prepare_with_client_headers(
        "/v1/responses",
        json!({
            "model": "gpt-5.6-sol",
            "prompt_cache_key": "prompt-session",
            "input": []
        }),
        &account(),
        &client_headers,
    )
    .expect("v1 wire fixture must prepare");

    for (header, expected) in string_map(&fixture["captured_client_headers"]) {
        let actual = prepared
            .headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(&header))
            .map(|(_, value)| value);
        assert_eq!(
            actual,
            Some(&expected),
            "safe client header {header} must survive end-to-end"
        );
    }

    for (header, expected) in string_map(&fixture["expected_gateway_owned_headers"]) {
        let actual = prepared
            .headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(&header))
            .map(|(_, value)| value);
        assert_eq!(
            actual,
            Some(&expected),
            "client input must not override gateway-owned {header}"
        );
    }
}

#[test]
fn newer_safe_client_version_is_preserved_instead_of_silently_rewritten() {
    let client_headers = BTreeMap::from([
        ("version".to_owned(), "0.154.0".to_owned()),
        (
            "user-agent".to_owned(),
            "codex-cli/0.154.0 (linux; x86_64)".to_owned(),
        ),
    ]);

    let prepared = CodexAdapter::prepare_with_client_headers(
        "/v1/responses",
        json!({"model":"gpt-5.6-sol","input":[]}),
        &account(),
        &client_headers,
    )
    .expect("safe future client version");

    assert_eq!(prepared.headers.get("Version"), Some(&"0.154.0".to_owned()));
    assert_eq!(
        prepared.headers.get("User-Agent"),
        Some(&"codex-cli/0.154.0 (linux; x86_64)".to_owned())
    );
}

#[test]
fn duplicate_case_variants_of_safe_header_are_rejected() {
    let client_headers = BTreeMap::from([
        ("Version".to_owned(), "0.153.2".to_owned()),
        ("version".to_owned(), "0.154.0".to_owned()),
    ]);

    let error = CodexAdapter::prepare_with_client_headers(
        "/v1/responses",
        json!({"model":"gpt-5.6-sol","input":[]}),
        &account(),
        &client_headers,
    )
    .err()
    .expect("ambiguous duplicate safe header must fail closed");

    assert!(matches!(error, PrepareError::InvalidClientHeader(_)));
}

#[test]
fn oversized_or_control_character_safe_headers_are_rejected() {
    for value in ["x".repeat(8 * 1024), "ok\nnot-ok".to_owned()] {
        let client_headers = BTreeMap::from([("x-codex-turn-metadata".to_owned(), value)]);

        let error = CodexAdapter::prepare_with_client_headers(
            "/v1/responses",
            json!({"model":"gpt-5.6-sol","input":[]}),
            &account(),
            &client_headers,
        )
        .err()
        .expect("invalid preserved header must fail closed");

        assert!(matches!(error, PrepareError::InvalidClientHeader(_)));
    }
}
