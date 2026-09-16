use std::{
    env,
    net::SocketAddr,
    process,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use agentproxy_gateway::{
    app, snapshot_poll::SnapshotPollPolicy, sync_snapshot_once_conditional, AppState,
    SnapshotConditionalOutcome, SnapshotSyncOutcome,
};
use tokio::{net::TcpListener, task::JoinHandle, time::sleep};

const DEFAULT_API_PORT: u16 = 20128;
const DEFAULT_DASHBOARD_PORT: u16 = 20129;

#[tokio::main(flavor = "multi_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = RuntimeConfig::from_env()?;
    let state = AppState::new_with_legacy_base_url(config.legacy_base_url.clone());
    let poller = spawn_snapshot_poller(state.clone(), config.snapshot_url.clone(), config.token);

    let listener = TcpListener::bind(config.listen_addr).await?;
    eprintln!(
        "[agentproxy-rust] gateway listening on {}",
        config.listen_addr
    );

    let server = axum::serve(listener, app(state)).with_graceful_shutdown(shutdown_signal());
    let result = server.await;
    poller.abort();
    result?;
    Ok(())
}

struct RuntimeConfig {
    listen_addr: SocketAddr,
    snapshot_url: String,
    legacy_base_url: String,
    token: String,
}

impl RuntimeConfig {
    fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let api_port = env_port("API_PORT", DEFAULT_API_PORT)?;
        let dashboard_port = env_port("DASHBOARD_PORT", DEFAULT_DASHBOARD_PORT)?;
        let host = env::var("AGENTPROXY_RUST_CORE_HOST")
            .or_else(|_| env::var("OMNIROUTE_RUST_CORE_HOST"))
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                env::var("HOST")
                    .ok()
                    .filter(|value| !value.trim().is_empty())
            })
            .unwrap_or_else(|| "0.0.0.0".to_owned());
        let listen_addr: SocketAddr = format!("{host}:{api_port}").parse()?;
        let snapshot_url = env::var("AGENTPROXY_RUST_CORE_SNAPSHOT_URL")
            .or_else(|_| env::var("OMNIROUTE_RUST_CORE_SNAPSHOT_URL"))
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| {
                format!("http://127.0.0.1:{dashboard_port}/api/internal/rust-core/snapshot")
            });
        let legacy_base_url = env::var("AGENTPROXY_RUST_CORE_LEGACY_BASE_URL")
            .or_else(|_| env::var("OMNIROUTE_RUST_CORE_LEGACY_BASE_URL"))
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| format!("http://127.0.0.1:{dashboard_port}"));
        let token = env::var("AGENTPROXY_INTERNAL_SERVICE_TOKEN").or_else(|_| env::var("OMNIROUTE_INTERNAL_SERVICE_TOKEN"))
            .ok()
            .filter(|value| !value.trim().is_empty())
            .ok_or("AGENTPROXY_INTERNAL_SERVICE_TOKEN (or legacy OMNIROUTE_INTERNAL_SERVICE_TOKEN) is required")?;

        Ok(Self {
            listen_addr,
            snapshot_url,
            legacy_base_url,
            token,
        })
    }
}

fn env_port(name: &str, default: u16) -> Result<u16, Box<dyn std::error::Error>> {
    match env::var(name) {
        Ok(value) if !value.trim().is_empty() => Ok(value.parse::<u16>()?),
        _ => Ok(default),
    }
}

fn snapshot_poll_seed() -> u64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    (nanos as u64) ^ ((nanos >> 64) as u64) ^ u64::from(process::id())
}

fn spawn_snapshot_poller(state: AppState, url: String, token: String) -> JoinHandle<()> {
    tokio::spawn(async move {
        let client = match reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(3))
            .read_timeout(Duration::from_secs(10))
            .pool_idle_timeout(Duration::from_secs(30))
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                eprintln!("[agentproxy-rust] failed to create control-plane HTTP client: {error}");
                return;
            }
        };
        let started_at = Instant::now();
        let mut policy = SnapshotPollPolicy::new(snapshot_poll_seed(), Duration::ZERO);
        let mut etag: Option<String> = None;
        let mut last_error = String::new();

        loop {
            match sync_snapshot_once_conditional(&state, &client, &url, &token, etag.as_deref())
                .await
            {
                Ok(result) => {
                    if let Some(next_etag) = result.etag {
                        etag = Some(next_etag);
                    }
                    policy.record_success(started_at.elapsed());
                    last_error.clear();
                    if let SnapshotConditionalOutcome::Snapshot(SnapshotSyncOutcome::Installed {
                        source_id,
                        generation,
                    }) = result.outcome
                    {
                        eprintln!(
                            "[agentproxy-rust] installed control snapshot source={} generation={generation}",
                            short_source(&source_id)
                        );
                    }
                }
                Err(error) => {
                    policy.record_failure();
                    let message = error.to_string();
                    if message != last_error {
                        eprintln!("[agentproxy-rust] control snapshot sync pending: {message}");
                        last_error = message;
                    }
                }
            }

            if let Some(stale_for) = policy.take_stale_alert(started_at.elapsed()) {
                eprintln!(
                    "[agentproxy-rust] control snapshot stale for {}s; continuing with last known good state",
                    stale_for.as_secs()
                );
            }
            sleep(policy.next_delay()).await;
        }
    })
}

fn short_source(source_id: &str) -> &str {
    source_id.get(..8).unwrap_or(source_id)
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("install SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = terminate.recv() => {},
        }
    }

    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
