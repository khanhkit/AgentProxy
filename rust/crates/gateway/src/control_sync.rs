use std::{error::Error, fmt};

use agentproxy_control_protocol::snapshot::{ConfigSnapshot, SnapshotError};

use crate::AppState;

pub const INTERNAL_SERVICE_AUTH_HEADER: &str = "x-agentproxy-internal-service-token";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotSyncOutcome {
    Installed { source_id: String, generation: u64 },
    Unchanged { source_id: String, generation: u64 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotSyncError {
    message: String,
}

impl SnapshotSyncError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for SnapshotSyncError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl Error for SnapshotSyncError {}

pub async fn sync_snapshot_once(
    state: &AppState,
    client: &reqwest::Client,
    url: &str,
    token: &str,
) -> Result<SnapshotSyncOutcome, SnapshotSyncError> {
    if token.trim().is_empty() {
        return Err(SnapshotSyncError::new("internal service token is empty"));
    }

    let response = client
        .get(url)
        .header(INTERNAL_SERVICE_AUTH_HEADER, token)
        .send()
        .await
        .map_err(|error| SnapshotSyncError::new(format!("snapshot request failed: {error}")))?;

    let status = response.status();
    if !status.is_success() {
        return Err(SnapshotSyncError::new(format!(
            "snapshot endpoint returned HTTP {}",
            status.as_u16()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| SnapshotSyncError::new(format!("snapshot body read failed: {error}")))?;
    let snapshot: ConfigSnapshot = serde_json::from_slice(&bytes)
        .map_err(|error| SnapshotSyncError::new(format!("invalid snapshot JSON: {error}")))?;
    let source_id = snapshot.source_id.clone();
    let generation = snapshot.generation;

    match state.install_snapshot(snapshot, false) {
        Ok(()) => Ok(SnapshotSyncOutcome::Installed {
            source_id,
            generation,
        }),
        Err(SnapshotError::StaleGeneration { current, received }) if current == received => {
            Ok(SnapshotSyncOutcome::Unchanged {
                source_id,
                generation,
            })
        }
        Err(error) => Err(SnapshotSyncError::new(format!(
            "snapshot rejected: {error:?}"
        ))),
    }
}
