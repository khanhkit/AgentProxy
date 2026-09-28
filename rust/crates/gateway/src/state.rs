use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

use agentproxy_account::{AccountLease, AccountRuntime};
use agentproxy_control_protocol::snapshot::{
    ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SnapshotError, SnapshotTracker,
};
use arc_swap::ArcSwapOption;
use sha2::{Digest, Sha256};
use tokio::sync::{watch, OwnedSemaphorePermit, Semaphore};

use crate::lifecycle::{LifecycleRecorder, LifecycleSnapshot, RequestLifecycleTracker};

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

const CONTINUATION_AFFINITY_CAPACITY: usize = 4096;
const CONTINUATION_AFFINITY_TTL: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ContinuationAffinityKey {
    caller_id: String,
    response_id_hash: [u8; 32],
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ContinuationAffinityBinding {
    pub(crate) account_id: String,
    pub(crate) credential_version: u64,
}

struct ContinuationAffinityEntry {
    binding: ContinuationAffinityBinding,
    expires_at: Instant,
    sequence: u64,
}

struct ContinuationAffinityStore {
    entries: HashMap<ContinuationAffinityKey, ContinuationAffinityEntry>,
    capacity: usize,
    ttl: Duration,
    next_sequence: u64,
}

impl ContinuationAffinityStore {
    fn new(capacity: usize, ttl: Duration) -> Self {
        Self {
            entries: HashMap::new(),
            capacity,
            ttl,
            next_sequence: 0,
        }
    }

    fn key(caller_id: &str, response_id: &str) -> ContinuationAffinityKey {
        ContinuationAffinityKey {
            caller_id: caller_id.to_owned(),
            response_id_hash: Sha256::digest(response_id.as_bytes()).into(),
        }
    }

    fn prune_expired(&mut self, now: Instant) {
        self.entries.retain(|_, entry| entry.expires_at > now);
    }

    fn register_at(
        &mut self,
        now: Instant,
        caller_id: &str,
        response_id: &str,
        binding: ContinuationAffinityBinding,
    ) {
        self.prune_expired(now);
        let key = Self::key(caller_id, response_id);
        if self.capacity == 0 {
            return;
        }
        if !self.entries.contains_key(&key) && self.entries.len() >= self.capacity {
            if let Some(oldest) = self
                .entries
                .iter()
                .min_by_key(|(_, entry)| entry.sequence)
                .map(|(key, _)| key.clone())
            {
                self.entries.remove(&oldest);
            }
        }

        self.next_sequence = self.next_sequence.wrapping_add(1);
        self.entries.insert(
            key,
            ContinuationAffinityEntry {
                binding,
                expires_at: now + self.ttl,
                sequence: self.next_sequence,
            },
        );
    }

    fn resolve_at(
        &mut self,
        now: Instant,
        caller_id: &str,
        response_id: &str,
    ) -> Option<ContinuationAffinityBinding> {
        self.prune_expired(now);
        self.entries
            .get(&Self::key(caller_id, response_id))
            .map(|entry| entry.binding.clone())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizedApiKey {
    pub id: String,
    pub allowed_connections: Vec<String>,
    pub(crate) principal_scope: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiKeyAuthError {
    Invalid,
    UnsupportedPolicy,
    EndpointDenied,
}

pub struct SelectedCodexAccount {
    pub config: CodexConnectionConfig,
    runtime: Arc<AccountRuntime>,
    _lease: AccountLease,
}

impl SelectedCodexAccount {
    pub(crate) fn record_auth_rejection(&self) {
        self.runtime.record_auth_rejection();
    }

    pub(crate) fn record_rate_limit(&self, model: Option<&str>, retry_after: Option<Duration>) {
        self.runtime
            .record_rate_limit(Instant::now(), model, retry_after);
    }

    pub(crate) fn record_transient_failure(&self) {
        self.runtime.record_transient_failure(Instant::now());
    }

    pub(crate) fn record_success(&self, model: Option<&str>) {
        self.runtime.record_success(Instant::now(), model);
    }
}

#[derive(Clone)]
pub struct AppState {
    runtime: Arc<ArcSwapOption<RuntimeSnapshot>>,
    tracker: Arc<Mutex<SnapshotTracker>>,
    http_client: reqwest::Client,
    legacy_base_url: Option<Arc<str>>,
    ingress_admission: Arc<Semaphore>,
    draining: Arc<AtomicBool>,
    force_shutdown: watch::Sender<bool>,
    selection_cursor: Arc<AtomicU64>,
    lifecycle: LifecycleRecorder,
    continuation_affinity: Arc<Mutex<ContinuationAffinityStore>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        let http_client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .read_timeout(Duration::from_secs(300))
            .tcp_keepalive(Duration::from_secs(60))
            .pool_idle_timeout(Duration::from_secs(90))
            .pool_max_idle_per_host(8)
            .build()
            .expect("static HTTP client configuration must be valid");

        let (force_shutdown, _) = watch::channel(false);

        Self {
            runtime: Arc::new(ArcSwapOption::empty()),
            tracker: Arc::new(Mutex::new(SnapshotTracker::default())),
            http_client,
            legacy_base_url: None,
            ingress_admission: Arc::new(Semaphore::new(128)),
            draining: Arc::new(AtomicBool::new(false)),
            force_shutdown,
            selection_cursor: Arc::new(AtomicU64::new(0)),
            lifecycle: LifecycleRecorder::default(),
            continuation_affinity: Arc::new(Mutex::new(ContinuationAffinityStore::new(
                CONTINUATION_AFFINITY_CAPACITY,
                CONTINUATION_AFFINITY_TTL,
            ))),
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

    pub fn begin_shutdown(&self) {
        self.draining.store(true, Ordering::SeqCst);
    }

    pub(crate) fn is_draining(&self) -> bool {
        self.draining.load(Ordering::SeqCst)
    }

    pub fn force_shutdown(&self) {
        let _ = self.force_shutdown.send(true);
    }

    pub(crate) fn force_shutdown_receiver(&self) -> watch::Receiver<bool> {
        self.force_shutdown.subscribe()
    }

    pub fn lifecycle_snapshot(&self) -> LifecycleSnapshot {
        self.lifecycle.snapshot()
    }

    pub(crate) fn request_lifecycle(&self) -> RequestLifecycleTracker {
        self.lifecycle.request_tracker()
    }

    pub(crate) fn register_continuation_affinity(
        &self,
        caller_scope: &str,
        response_id: &str,
        account_id: &str,
        credential_version: u64,
    ) {
        let mut store = self
            .continuation_affinity
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        store.register_at(
            Instant::now(),
            caller_scope,
            response_id,
            ContinuationAffinityBinding {
                account_id: account_id.to_owned(),
                credential_version,
            },
        );
    }

    pub(crate) fn resolve_continuation_affinity(
        &self,
        caller_scope: &str,
        response_id: &str,
    ) -> Option<ContinuationAffinityBinding> {
        let mut store = self
            .continuation_affinity
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        store.resolve_at(Instant::now(), caller_scope, response_id)
    }

    pub(crate) fn try_acquire_ingress(&self) -> Option<OwnedSemaphorePermit> {
        if self.is_draining() {
            return None;
        }
        Arc::clone(&self.ingress_admission).try_acquire_owned().ok()
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
        let mut next_tracker = tracker.clone();
        next_tracker.validate_and_advance(&snapshot, full_resync)?;

        let mut codex_ids = HashSet::with_capacity(snapshot.codex_connections.len());
        for config in &snapshot.codex_connections {
            if !codex_ids.insert(config.id.as_str()) {
                return Err(SnapshotError::DuplicateCodexConnectionId {
                    id: config.id.clone(),
                });
            }
        }

        let mut api_key_hashes = HashSet::with_capacity(snapshot.api_keys.len());
        for config in &snapshot.api_keys {
            if !api_key_hashes.insert(config.key_hash.to_ascii_lowercase()) {
                return Err(SnapshotError::DuplicateApiKeyHash);
            }
        }

        let previous = self.runtime.load_full();
        let previous_accounts: HashMap<&str, (u64, Arc<AccountRuntime>)> = previous
            .as_deref()
            .map(|runtime| {
                runtime
                    .codex_accounts
                    .iter()
                    .map(|entry| {
                        (
                            entry.config.id.as_str(),
                            (entry.config.credential_version, Arc::clone(&entry.runtime)),
                        )
                    })
                    .collect()
            })
            .unwrap_or_default();

        let codex_accounts = snapshot
            .codex_connections
            .into_iter()
            .map(|config| {
                let runtime = match previous_accounts.get(config.id.as_str()) {
                    Some((credential_version, runtime))
                        if *credential_version == config.credential_version =>
                    {
                        Arc::clone(runtime)
                    }
                    _ => Arc::new(AccountRuntime::new(&config.id, config.max_concurrent)),
                };
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
        *tracker = next_tracker;
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
            principal_scope: key_hash,
        })
    }

    pub fn select_codex_account(&self) -> Option<SelectedCodexAccount> {
        self.select_codex_account_for_model(&[], &[], None)
    }

    pub fn select_codex_account_excluding(
        &self,
        excluded_ids: &[&str],
    ) -> Option<SelectedCodexAccount> {
        self.select_codex_account_for_model(&[], excluded_ids, None)
    }

    pub fn select_codex_account_for(
        &self,
        allowed_ids: &[String],
        excluded_ids: &[&str],
    ) -> Option<SelectedCodexAccount> {
        self.select_codex_account_for_model(allowed_ids, excluded_ids, None)
    }

    pub(crate) fn select_codex_account_for_binding(
        &self,
        binding: &ContinuationAffinityBinding,
        allowed_ids: &[String],
        model: Option<&str>,
    ) -> Option<SelectedCodexAccount> {
        let runtime = self.runtime.load_full()?;
        let now = Instant::now();
        let entry = runtime.codex_accounts.iter().find(|entry| {
            entry.config.id == binding.account_id
                && entry.config.credential_version == binding.credential_version
                && entry.runtime.is_available()
                && entry.runtime.is_selectable_at(now, model)
                && (allowed_ids.is_empty() || allowed_ids.iter().any(|id| id == &entry.config.id))
        })?;
        let lease = entry.runtime.try_acquire()?;
        Some(SelectedCodexAccount {
            config: entry.config.clone(),
            runtime: Arc::clone(&entry.runtime),
            _lease: lease,
        })
    }

    pub fn select_codex_account_for_model(
        &self,
        allowed_ids: &[String],
        excluded_ids: &[&str],
        model: Option<&str>,
    ) -> Option<SelectedCodexAccount> {
        let runtime = self.runtime.load_full()?;
        let now = Instant::now();
        let mut candidates: Vec<&CodexRuntimeEntry> = runtime
            .codex_accounts
            .iter()
            .filter(|entry| {
                entry.runtime.is_available()
                    && entry.runtime.is_selectable_at(now, model)
                    && (allowed_ids.is_empty()
                        || allowed_ids.iter().any(|id| id == &entry.config.id))
                    && !excluded_ids.iter().any(|id| *id == entry.config.id)
            })
            .collect();

        if candidates.len() > 1 {
            let offset =
                self.selection_cursor.fetch_add(1, Ordering::Relaxed) as usize % candidates.len();
            candidates.rotate_left(offset);
        }

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
                    runtime: Arc::clone(&entry.runtime),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ingress_admission_is_bounded_and_recovers_when_a_permit_is_released() {
        let state = AppState::new();
        let permits: Vec<_> = (0..128)
            .map(|_| {
                state
                    .try_acquire_ingress()
                    .expect("configured ingress permit should be available")
            })
            .collect();
        assert!(state.try_acquire_ingress().is_none());
        drop(permits);
        assert!(state.try_acquire_ingress().is_some());
    }

    #[test]
    fn shutdown_stops_new_ingress_and_broadcasts_force_phase() {
        let state = AppState::new();
        let mut forced = state.force_shutdown_receiver();
        assert!(state.try_acquire_ingress().is_some());
        assert!(!*forced.borrow());

        state.begin_shutdown();
        assert!(state.try_acquire_ingress().is_none());

        state.force_shutdown();
        assert!(*forced.borrow_and_update());
    }

    fn codex_config(id: &str, credential_version: u64) -> CodexConnectionConfig {
        CodexConnectionConfig {
            id: id.to_owned(),
            access_token: format!("token-{id}-v{credential_version}"),
            workspace_id: None,
            base_url: "https://example.invalid".to_owned(),
            max_concurrent: Some(1),
            credential_version,
        }
    }

    fn state_with_accounts(ids: &[&str]) -> AppState {
        let state = AppState::new();
        let mut snapshot = ConfigSnapshot::empty(
            agentproxy_control_protocol::snapshot::SUPPORTED_SCHEMA_VERSION,
            1,
        );
        snapshot.codex_connections = ids.iter().map(|id| codex_config(id, 1)).collect();
        state
            .install_snapshot(snapshot, true)
            .expect("test snapshot should install");
        state
    }

    fn runtime_for(state: &AppState, id: &str) -> Arc<AccountRuntime> {
        let snapshot = state
            .runtime
            .load_full()
            .expect("runtime snapshot should be installed");
        snapshot
            .codex_accounts
            .iter()
            .find(|entry| entry.config.id == id)
            .map(|entry| Arc::clone(&entry.runtime))
            .expect("requested account runtime should exist")
    }

    #[test]
    fn duplicate_codex_ids_are_rejected_atomically_without_advancing_generation() {
        let state = state_with_accounts(&["a"]);
        let original_runtime = runtime_for(&state, "a");

        let mut duplicate = ConfigSnapshot::empty(
            agentproxy_control_protocol::snapshot::SUPPORTED_SCHEMA_VERSION,
            2,
        );
        duplicate.codex_connections = vec![codex_config("a", 1), codex_config("a", 2)];

        assert!(state.install_snapshot(duplicate, false).is_err());
        assert!(Arc::ptr_eq(&original_runtime, &runtime_for(&state, "a")));

        let mut replacement = ConfigSnapshot::empty(
            agentproxy_control_protocol::snapshot::SUPPORTED_SCHEMA_VERSION,
            2,
        );
        replacement.codex_connections = vec![codex_config("b", 1)];
        state
            .install_snapshot(replacement, false)
            .expect("rejected duplicate snapshot must not consume generation 2");
        assert!(runtime_for(&state, "b").is_selectable_at(Instant::now(), None));
    }

    #[test]
    fn duplicate_api_key_hashes_are_rejected_case_insensitively_and_atomically() {
        let state = state_with_accounts(&["a"]);
        let original_runtime = runtime_for(&state, "a");
        let api_key = |id: &str, key_hash: &str| ApiKeyConfig {
            id: id.to_owned(),
            key_hash: key_hash.to_owned(),
            allowed_connections: Vec::new(),
            allowed_endpoints: Vec::new(),
            unsupported_policy: false,
        };

        let mut duplicate = ConfigSnapshot::empty(
            agentproxy_control_protocol::snapshot::SUPPORTED_SCHEMA_VERSION,
            2,
        );
        duplicate.codex_connections = vec![codex_config("a", 1)];
        duplicate.api_keys = vec![api_key("key-a", "ABCDEF"), api_key("key-b", "abcdef")];

        assert!(state.install_snapshot(duplicate, false).is_err());
        assert!(Arc::ptr_eq(&original_runtime, &runtime_for(&state, "a")));

        let mut valid = ConfigSnapshot::empty(
            agentproxy_control_protocol::snapshot::SUPPORTED_SCHEMA_VERSION,
            2,
        );
        valid.codex_connections = vec![codex_config("a", 1)];
        valid.api_keys = vec![api_key("key-a", "abcdef")];
        state
            .install_snapshot(valid, false)
            .expect("rejected duplicate-key snapshot must not consume generation 2");
    }

    #[test]
    fn same_credential_version_preserves_runtime_state() {
        let state = state_with_accounts(&["a"]);
        let original_runtime = runtime_for(&state, "a");
        original_runtime.record_transient_failure(Instant::now());
        assert_eq!(original_runtime.consecutive_failures(), 1);

        let mut snapshot = ConfigSnapshot::empty(
            agentproxy_control_protocol::snapshot::SUPPORTED_SCHEMA_VERSION,
            2,
        );
        snapshot.codex_connections = vec![codex_config("a", 1)];
        state
            .install_snapshot(snapshot, false)
            .expect("same-version snapshot should install");

        let current_runtime = runtime_for(&state, "a");
        assert!(Arc::ptr_eq(&original_runtime, &current_runtime));
        assert_eq!(current_runtime.consecutive_failures(), 1);
    }

    #[test]
    fn changed_credential_version_replaces_runtime_and_clears_old_health_state() {
        let state = state_with_accounts(&["a"]);
        let original_runtime = runtime_for(&state, "a");
        let now = Instant::now();
        original_runtime.record_auth_rejection();
        original_runtime.record_rate_limit(now, Some("gpt-test"), Some(Duration::from_secs(30)));
        assert!(!original_runtime.is_selectable_at(now, Some("gpt-test")));

        let mut snapshot = ConfigSnapshot::empty(
            agentproxy_control_protocol::snapshot::SUPPORTED_SCHEMA_VERSION,
            2,
        );
        snapshot.codex_connections = vec![codex_config("a", 2)];
        state
            .install_snapshot(snapshot, false)
            .expect("credential-version update should install");

        let current_runtime = runtime_for(&state, "a");
        assert!(!Arc::ptr_eq(&original_runtime, &current_runtime));
        assert_eq!(current_runtime.consecutive_failures(), 0);
        assert_eq!(
            current_runtime.cooldown_remaining(now, Some("gpt-test")),
            None
        );
        assert!(current_runtime.is_selectable_at(now, Some("gpt-test")));
    }

    #[test]
    fn selector_skips_auth_invalid_account_when_healthy_alternative_exists() {
        let state = state_with_accounts(&["a", "b"]);
        let first = state
            .select_codex_account_for_model(&[], &[], Some("gpt-test"))
            .expect("first account should be selectable");
        let rejected_id = first.config.id.clone();
        first.record_auth_rejection();
        drop(first);

        let next = state
            .select_codex_account_for_model(&[], &[], Some("gpt-test"))
            .expect("healthy alternative should remain selectable");
        assert_ne!(next.config.id, rejected_id);
    }

    #[test]
    fn selector_applies_model_quota_without_blocking_other_models() {
        let state = state_with_accounts(&["a"]);
        let selected = state
            .select_codex_account_for_model(&[], &[], Some("gpt-a"))
            .expect("account should initially be selectable");
        selected.record_rate_limit(Some("gpt-a"), Some(Duration::from_secs(30)));
        drop(selected);

        assert!(state
            .select_codex_account_for_model(&[], &[], Some("gpt-a"))
            .is_none());
        assert!(state
            .select_codex_account_for_model(&[], &[], Some("gpt-b"))
            .is_some());
    }

    #[test]
    fn continuation_affinity_is_caller_scoped_and_ttl_bounded() {
        let now = Instant::now();
        let mut store = ContinuationAffinityStore::new(4, Duration::from_secs(10));
        store.register_at(
            now,
            "caller-a",
            "resp-shared",
            ContinuationAffinityBinding {
                account_id: "account-a".to_owned(),
                credential_version: 7,
            },
        );

        assert_eq!(
            store.resolve_at(now, "caller-a", "resp-shared"),
            Some(ContinuationAffinityBinding {
                account_id: "account-a".to_owned(),
                credential_version: 7,
            })
        );
        assert_eq!(store.resolve_at(now, "caller-b", "resp-shared"), None);
        assert_eq!(
            store.resolve_at(now + Duration::from_secs(11), "caller-a", "resp-shared"),
            None
        );
    }

    #[test]
    fn continuation_affinity_evicts_oldest_entry_at_capacity() {
        let now = Instant::now();
        let mut store = ContinuationAffinityStore::new(2, Duration::from_secs(60));
        for (offset, response_id) in ["resp-1", "resp-2", "resp-3"].into_iter().enumerate() {
            store.register_at(
                now + Duration::from_secs(offset as u64),
                "caller-a",
                response_id,
                ContinuationAffinityBinding {
                    account_id: format!("account-{response_id}"),
                    credential_version: 1,
                },
            );
        }

        assert_eq!(
            store.resolve_at(now + Duration::from_secs(3), "caller-a", "resp-1"),
            None
        );
        assert!(store
            .resolve_at(now + Duration::from_secs(3), "caller-a", "resp-2")
            .is_some());
        assert!(store
            .resolve_at(now + Duration::from_secs(3), "caller-a", "resp-3")
            .is_some());
    }
}
