use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
    time::Duration,
};

use agentproxy_account::{AccountLease, AccountRuntime};
use agentproxy_control_protocol::snapshot::{
    ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SnapshotError, SnapshotTracker,
};
use arc_swap::ArcSwapOption;
use sha2::{Digest, Sha256};

struct CodexRuntimeEntry {
    config: CodexConnectionConfig,
    runtime: Arc<AccountRuntime>,
}

struct RuntimeSnapshot {
    codex_accounts: Vec<CodexRuntimeEntry>,
    api_keys: HashMap<String, ApiKeyConfig>,
    codex_catalog_models: HashSet<String>,
    codex_native_models: HashSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizedApiKey {
    pub id: String,
    pub allowed_connections: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiKeyAuthError {
    Invalid,
    UnsupportedPolicy,
    EndpointDenied,
}

pub struct SelectedCodexAccount {
    pub config: CodexConnectionConfig,
    _lease: AccountLease,
}

#[derive(Clone)]
pub struct AppState {
    runtime: Arc<ArcSwapOption<RuntimeSnapshot>>,
    tracker: Arc<Mutex<SnapshotTracker>>,
    http_client: reqwest::Client,
    legacy_base_url: Option<Arc<str>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        let http_client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(300))
            .tcp_keepalive(Duration::from_secs(60))
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(8)
            .build()
            .expect("static HTTP client configuration must be valid");

        Self {
            runtime: Arc::new(ArcSwapOption::empty()),
            tracker: Arc::new(Mutex::new(SnapshotTracker::default())),
            http_client,
            legacy_base_url: None,
        }
    }

    pub fn new_with_legacy_base_url(base_url: impl Into<String>) -> Self {
        let mut state = Self::new();
        state.legacy_base_url = Some(Arc::<str>::from(base_url.into().trim_end_matches('/')));
        state
    }

    pub(crate) fn legacy_base_url(&self) -> Option<Arc<str>> {
        self.legacy_base_url.clone()
    }

    pub fn is_ready(&self) -> bool {
        self.runtime.load().is_some()
    }

    pub(crate) fn http_client(&self) -> &reqwest::Client {
        &self.http_client
    }

    pub fn install_snapshot(
        &self,
        snapshot: ConfigSnapshot,
        full_resync: bool,
    ) -> Result<(), SnapshotError> {
        let mut tracker = self
            .tracker
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        tracker.validate_and_advance(&snapshot, full_resync)?;

        let previous = self.runtime.load_full();
        let previous_accounts: HashMap<&str, Arc<AccountRuntime>> = previous
            .as_deref()
            .map(|runtime| {
                runtime
                    .codex_accounts
                    .iter()
                    .map(|entry| (entry.config.id.as_str(), Arc::clone(&entry.runtime)))
                    .collect()
            })
            .unwrap_or_default();

        let codex_accounts = snapshot
            .codex_connections
            .into_iter()
            .map(|config| {
                let runtime = previous_accounts
                    .get(config.id.as_str())
                    .cloned()
                    .unwrap_or_else(|| {
                        Arc::new(AccountRuntime::new(&config.id, config.max_concurrent))
                    });
                runtime.set_max_concurrent(config.max_concurrent);
                CodexRuntimeEntry { runtime, config }
            })
            .collect();
        let api_keys = snapshot
            .api_keys
            .into_iter()
            .map(|config| (config.key_hash.to_ascii_lowercase(), config))
            .collect();
        let codex_catalog_models = snapshot.codex_catalog_models.into_iter().collect();
        let codex_native_models = snapshot.codex_native_models.into_iter().collect();

        self.runtime.store(Some(Arc::new(RuntimeSnapshot {
            codex_accounts,
            api_keys,
            codex_catalog_models,
            codex_native_models,
        })));
        Ok(())
    }

    pub fn resolve_native_codex_model(&self, requested_model: &str) -> Option<String> {
        let runtime = self.runtime.load_full()?;
        let requested = requested_model.trim();
        if requested.is_empty() {
            return None;
        }

        if let Some(bare) = requested
            .strip_prefix("codex/")
            .or_else(|| requested.strip_prefix("cx/"))
        {
            return (!runtime.codex_accounts.is_empty()
                && runtime.codex_catalog_models.contains(bare))
            .then(|| bare.to_owned());
        }

        (!runtime.codex_accounts.is_empty() && runtime.codex_native_models.contains(requested))
            .then(|| requested.to_owned())
    }

    pub fn authorize_api_key(
        &self,
        raw_key: &str,
        endpoint_category: &str,
    ) -> Result<AuthorizedApiKey, ApiKeyAuthError> {
        let runtime = self.runtime.load_full().ok_or(ApiKeyAuthError::Invalid)?;
        let key_hash = format!("{:x}", Sha256::digest(raw_key.as_bytes()));
        let config = runtime
            .api_keys
            .get(&key_hash)
            .ok_or(ApiKeyAuthError::Invalid)?;
        if config.unsupported_policy {
            return Err(ApiKeyAuthError::UnsupportedPolicy);
        }
        if !config.allowed_endpoints.is_empty()
            && !config
                .allowed_endpoints
                .iter()
                .any(|value| value == endpoint_category)
        {
            return Err(ApiKeyAuthError::EndpointDenied);
        }
        Ok(AuthorizedApiKey {
            id: config.id.clone(),
            allowed_connections: config.allowed_connections.clone(),
        })
    }

    pub fn select_codex_account(&self) -> Option<SelectedCodexAccount> {
        self.select_codex_account_for(&[], &[])
    }

    pub fn select_codex_account_excluding(
        &self,
        excluded_ids: &[&str],
    ) -> Option<SelectedCodexAccount> {
        self.select_codex_account_for(&[], excluded_ids)
    }

    pub fn select_codex_account_for(
        &self,
        allowed_ids: &[String],
        excluded_ids: &[&str],
    ) -> Option<SelectedCodexAccount> {
        let runtime = self.runtime.load_full()?;
        let mut candidates: Vec<&CodexRuntimeEntry> = runtime
            .codex_accounts
            .iter()
            .filter(|entry| {
                entry.runtime.is_available()
                    && (allowed_ids.is_empty()
                        || allowed_ids.iter().any(|id| id == &entry.config.id))
                    && !excluded_ids.iter().any(|id| *id == entry.config.id)
            })
            .collect();

        while !candidates.is_empty() {
            let mut best_index = 0;
            for index in 1..candidates.len() {
                if rank(candidates[index]) > rank(candidates[best_index]) {
                    best_index = index;
                }
            }

            let entry = candidates.swap_remove(best_index);
            if let Some(lease) = entry.runtime.try_acquire() {
                return Some(SelectedCodexAccount {
                    config: entry.config.clone(),
                    _lease: lease,
                });
            }
        }

        None
    }
}

fn rank(entry: &CodexRuntimeEntry) -> (u32, u32) {
    (
        entry.runtime.health_score(),
        u32::MAX - entry.runtime.in_flight(),
    )
}
