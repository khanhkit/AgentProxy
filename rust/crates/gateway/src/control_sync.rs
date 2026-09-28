use std::{error::Error, fmt, sync::OnceLock, time::Duration};

use agentproxy_control_protocol::snapshot::{ConfigSnapshot, SnapshotError};
use reqwest::{
    header::{ETAG, IF_NONE_MATCH},
    StatusCode,
};

use crate::{
    bounded_response::{read_bounded_response, BoundedResponseError},
    transport_policy::validate_secret_bearing_url,
    AppState,
};

pub const INTERNAL_SERVICE_AUTH_HEADER: &str = "x-agentproxy-internal-service-token";
const MAX_SNAPSHOT_RESPONSE_BYTES: usize = 16 * 1024 * 1024;

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

fn snapshot_http_client() -> Result<&'static reqwest::Client, SnapshotSyncError> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    match CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .read_timeout(Duration::from_secs(10))
            .pool_idle_timeout(Duration::from_secs(30))
            .build()
            .map_err(|error| error.to_string())
    }) {
        Ok(client) => Ok(client),
        Err(error) => Err(SnapshotSyncError::new(format!(
            "failed to create safe snapshot HTTP client: {error}"
        ))),
    }
}

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
    _client: &reqwest::Client,
    url: &str,
    token: &str,
    etag: Option<&str>,
) -> Result<SnapshotConditionalResult, SnapshotSyncError> {
    if token.trim().is_empty() {
        return Err(SnapshotSyncError::new("internal service token is empty"));
    }
    let url = validate_secret_bearing_url(url)
        .map_err(|error| SnapshotSyncError::new(format!("snapshot endpoint rejected: {error}")))?;

    // Snapshot auth is a custom secret header, so redirect behavior must not
    // depend on the caller-supplied reqwest client. Own a dedicated no-redirect
    // client here to guarantee the token cannot cross origins.
    let mut request = snapshot_http_client()?
        .get(url)
        .header(INTERNAL_SERVICE_AUTH_HEADER, token);
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

    let bytes = match read_bounded_response(response, MAX_SNAPSHOT_RESPONSE_BYTES).await {
        Ok(bytes) => bytes,
        Err(BoundedResponseError::TooLarge { .. }) => {
            return Err(SnapshotSyncError::new("snapshot body exceeds 16 MiB limit"))
        }
        Err(BoundedResponseError::Transport(error)) => {
            return Err(SnapshotSyncError::new(format!(
                "snapshot body read failed: {error}"
            )))
        }
    };
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
