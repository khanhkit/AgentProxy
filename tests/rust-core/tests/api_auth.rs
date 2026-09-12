use agentproxy_control_protocol::snapshot::{
    ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::{ApiKeyAuthError, AppState};
use sha2::{Digest, Sha256};

fn hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn key(id: &str, secret: &str) -> ApiKeyConfig {
    ApiKeyConfig {
        id: id.to_owned(),
        key_hash: hash(secret),
        allowed_connections: Vec::new(),
        allowed_endpoints: Vec::new(),
        unsupported_policy: false,
    }
}

fn account(id: &str) -> CodexConnectionConfig {
    CodexConnectionConfig {
        id: id.to_owned(),
        access_token: format!("token-{id}"),
        workspace_id: None,
        base_url: "http://127.0.0.1:1".to_owned(),
        max_concurrent: Some(4),
        credential_version: 1,
    }
}

fn state_with(keys: Vec<ApiKeyConfig>) -> AppState {
    let state = AppState::new();
    state
        .install_snapshot(
            ConfigSnapshot {
                schema_version: SUPPORTED_SCHEMA_VERSION,
                source_id: "node-a".to_owned(),
                generation: 1,
                codex_connections: vec![account("a"), account("b")],
                api_keys: keys,
                codex_catalog_models: Vec::new(),
                codex_native_models: Vec::new(),
            },
            false,
        )
        .unwrap();
    state
}

#[test]
fn authenticates_hashed_client_key_without_storing_plaintext() {
    let state = state_with(vec![key("client-a", "secret-a")]);
    let authorized = state.authorize_api_key("secret-a", "chat").unwrap();
    assert_eq!(authorized.id, "client-a");
    assert!(authorized.allowed_connections.is_empty());
    assert_eq!(
        state.authorize_api_key("wrong", "chat"),
        Err(ApiKeyAuthError::Invalid)
    );
}

#[test]
fn rejects_unsupported_or_endpoint_denied_policy() {
    let mut unsupported = key("complex", "complex-secret");
    unsupported.unsupported_policy = true;
    let mut models_only = key("models-only", "models-secret");
    models_only.allowed_endpoints = vec!["models".to_owned()];
    let state = state_with(vec![unsupported, models_only]);

    assert_eq!(
        state.authorize_api_key("complex-secret", "chat"),
        Err(ApiKeyAuthError::UnsupportedPolicy)
    );
    assert_eq!(
        state.authorize_api_key("models-secret", "chat"),
        Err(ApiKeyAuthError::EndpointDenied)
    );
}

#[test]
fn allowed_connections_restrict_account_selection() {
    let mut restricted = key("restricted", "restricted-secret");
    restricted.allowed_connections = vec!["b".to_owned()];
    let state = state_with(vec![restricted]);
    let authorized = state
        .authorize_api_key("restricted-secret", "chat")
        .unwrap();

    let selected = state
        .select_codex_account_for(&authorized.allowed_connections, &[])
        .expect("allowed account");
    assert_eq!(selected.config.id, "b");
}
