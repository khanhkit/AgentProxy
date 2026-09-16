use std::{error::Error, fmt};

use agentproxy_control_protocol::snapshot::{ConfigSnapshot, SnapshotError};
use reqwest::{
    header::{ETAG, IF_NONE_MATCH},
    StatusCode,
};

use crate::AppState;

pub const INTERNAL_SERVICE_AUTH_HEADER: &str = "x-agentproxy-internal-service-token";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotSyncOutcome {
    Installed { source_id: String, generation: u64 },
    Unchanged { source_id: String, generation: u64 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotConditionalOutcome {
    Snapshot(SnapshotSyncOutcome),
    NotModified,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotConditionalResult {
    pub outcome: SnapshotConditionalOutcome,
    pub etag: Option<String>,
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
    let result = sync_snapshot_once_conditional(state, client, url, token, None).await?;
    match result.outcome {
        SnapshotConditionalOutcome::Snapshot(outcome) => Ok(outcome),
        SnapshotConditionalOutcome::NotModified => Err(SnapshotSyncError::new(
            "snapshot endpoint returned 304 without a conditional validator",
        )),
    }
}

pub async fn sync_snapshot_once_conditional(
    state: &AppState,
    client: &reqwest::Client,
    url: &str,
    token: &str,
    etag: Option<&str>,
) -> Result<SnapshotConditionalResult, SnapshotSyncError> {
    if token.trim().is_empty() {
        return Err(SnapshotSyncError::new("internal service token is empty"));
    }
    let mut request = client.get(url).header(INTERNAL_SERVICE_AUTH_HEADER, token);
    if let Some(etag) = etag.filter(|value| !value.trim().is_empty()) {
        request = request.header(IF_NONE_MATCH, etag);
    }
    let response = request
        .send()
        .await
        .map_err(|error| SnapshotSyncError::new(format!("snapshot request failed: {error}")))?;

    let status = response.status();
    let response_etag = response
        .headers()
        .get(ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    if status == StatusCode::NOT_MODIFIED {
        return Ok(SnapshotConditionalResult {
            outcome: SnapshotConditionalOutcome::NotModified,
            etag: response_etag.or_else(|| etag.map(str::to_owned)),
        });
    }
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

    let outcome = match state.install_snapshot(snapshot, false) {
        Ok(()) => SnapshotSyncOutcome::Installed {
            source_id,
            generation,
        },
        Err(SnapshotError::StaleGeneration { current, received }) if current == received => {
            SnapshotSyncOutcome::Unchanged {
                source_id,
                generation,
            }
        }
        Err(error) => {
            return Err(SnapshotSyncError::new(format!(
                "snapshot rejected: {error:?}"
            )))
        }
    };

    Ok(SnapshotConditionalResult {
        outcome: SnapshotConditionalOutcome::Snapshot(outcome),
        etag: response_etag,
    })
}
