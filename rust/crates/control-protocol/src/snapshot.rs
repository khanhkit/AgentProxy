use std::fmt;

use serde::{Deserialize, Serialize};

pub const SUPPORTED_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CodexConnectionConfig {
    pub id: String,
    pub access_token: String,
    pub workspace_id: Option<String>,
    pub base_url: String,
    pub max_concurrent: Option<u32>,
    pub credential_version: u64,
}

impl fmt::Debug for CodexConnectionConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CodexConnectionConfig")
            .field("id", &self.id)
            .field("access_token", &"[REDACTED]")
            .field("workspace_id", &self.workspace_id)
            .field("base_url", &self.base_url)
            .field("max_concurrent", &self.max_concurrent)
            .field("credential_version", &self.credential_version)
            .finish()
    }
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiKeyConfig {
    pub id: String,
    pub key_hash: String,
    #[serde(default)]
    pub allowed_connections: Vec<String>,
    #[serde(default)]
    pub allowed_endpoints: Vec<String>,
    #[serde(default)]
    pub unsupported_policy: bool,
}

impl fmt::Debug for ApiKeyConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ApiKeyConfig")
            .field("id", &self.id)
            .field("key_hash", &"[REDACTED]")
            .field("allowed_connections", &self.allowed_connections)
            .field("allowed_endpoints", &self.allowed_endpoints)
            .field("unsupported_policy", &self.unsupported_policy)
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConfigSnapshot {
    pub schema_version: u32,
    pub source_id: String,
    pub generation: u64,
    #[serde(default)]
    pub codex_connections: Vec<CodexConnectionConfig>,
    #[serde(default)]
    pub api_keys: Vec<ApiKeyConfig>,
    #[serde(default)]
    pub codex_catalog_models: Vec<String>,
    #[serde(default)]
    pub codex_native_models: Vec<String>,
}

impl ConfigSnapshot {
    pub fn empty(schema_version: u32, generation: u64) -> Self {
        Self {
            schema_version,
            source_id: "test".to_owned(),
            generation,
            codex_connections: Vec::new(),
            api_keys: Vec::new(),
            codex_catalog_models: Vec::new(),
            codex_native_models: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotError {
    UnsupportedSchema { received: u32, supported: u32 },
    StaleGeneration { current: u64, received: u64 },
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct SnapshotTracker {
    source_id: Option<String>,
    generation: Option<u64>,
}

impl SnapshotTracker {
    pub const fn generation(&self) -> Option<u64> {
        self.generation
    }

    pub fn validate_and_advance(
        &mut self,
        snapshot: &ConfigSnapshot,
        full_resync: bool,
    ) -> Result<(), SnapshotError> {
        if snapshot.schema_version != SUPPORTED_SCHEMA_VERSION {
            return Err(SnapshotError::UnsupportedSchema {
                received: snapshot.schema_version,
                supported: SUPPORTED_SCHEMA_VERSION,
            });
        }

        let source_changed = self
            .source_id
            .as_deref()
            .is_some_and(|current| current != snapshot.source_id);

        if !full_resync && !source_changed {
            if let Some(current) = self.generation {
                if snapshot.generation <= current {
                    return Err(SnapshotError::StaleGeneration {
                        current,
                        received: snapshot.generation,
                    });
                }
            }
        }

        self.source_id = Some(snapshot.source_id.clone());
        self.generation = Some(snapshot.generation);
        Ok(())
    }
}
