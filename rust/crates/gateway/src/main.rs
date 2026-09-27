use std::{
    env,
    net::SocketAddr,
    process,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use agentproxy_gateway::{
    app,
    shutdown::{await_bounded_shutdown, ShutdownOutcome},
    snapshot_poll::SnapshotPollPolicy,
    sync_snapshot_once_conditional, AppState, SnapshotConditionalOutcome, SnapshotSyncOutcome,
};
use tokio::{net::TcpListener, sync::oneshot, task::JoinHandle, time::sleep};

const DEFAULT_API_PORT: u16 = 20128;
const DEFAULT_DASHBOARD_PORT: u16 = 20129;
const DEFAULT_SHUTDOWN_DRAIN_MS: u64 = 15_000;
const FORCE_SHUTDOWN_SETTLE_MS: u64 = 2_000;

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

    let (graceful_tx, graceful_rx) = oneshot::channel::<()>();
    let server = axum::serve(listener, app(state.clone())).with_graceful_shutdown(async move {
        let _ = graceful_rx.await;
    });
    let drain_state = state.clone();
    let force_state = state.clone();
    let poller_abort = poller.abort_handle();
    let drain_timeout = config.shutdown_drain_timeout;

    let outcome = await_bounded_shutdown(
        server,
        shutdown_signal(),
        drain_timeout,
        Duration::from_millis(FORCE_SHUTDOWN_SETTLE_MS),
        move || {
            drain_state.begin_shutdown();
            poller_abort.abort();
            eprintln!(
                "[agentproxy-rust] shutdown signal received; draining for up to {} ms",
                drain_timeout.as_millis()
            );
            let _ = graceful_tx.send(());
        },
        move || {
            eprintln!(
                "[agentproxy-rust] shutdown drain deadline exceeded; terminating long-lived sessions"
            );
            force_state.force_shutdown();
        },
    )
    .await?;

    poller.abort();
    match outcome {
        ShutdownOutcome::ServerExited => {}
        ShutdownOutcome::Drained => {
            eprintln!("[agentproxy-rust] graceful shutdown completed within drain deadline");
        }
        ShutdownOutcome::DeadlineExceeded => {
            eprintln!("[agentproxy-rust] forced long-lived sessions closed after drain deadline");
        }
        ShutdownOutcome::HardDeadlineExceeded => {
            eprintln!(
                "[agentproxy-rust] forced shutdown settle deadline exceeded; exiting process"
            );
            process::exit(0);
        }
    }
    Ok(())
}

struct RuntimeConfig {
    listen_addr: SocketAddr,
    snapshot_url: String,
    legacy_base_url: String,
    token: String,
    shutdown_drain_timeout: Duration,
}

impl RuntimeConfig {
    fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let api_port = env_port("API_PORT", DEFAULT_API_PORT)?;
        let dashboard_port = env_port("DASHBOARD_PORT", DEFAULT_DASHBOARD_PORT)?;
        let host = env::var("AGENTPROXY_RUST_CORE_HOST")
            .or_else(|_| env::var("AGENTPROXY_RUST_CORE_HOST"))
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
            .or_else(|_| env::var("AGENTPROXY_RUST_CORE_SNAPSHOT_URL"))
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| {
                format!("http://127.0.0.1:{dashboard_port}/api/internal/rust-core/snapshot")
            });
        let legacy_base_url = env::var("AGENTPROXY_RUST_CORE_LEGACY_BASE_URL")
            .or_else(|_| env::var("AGENTPROXY_RUST_CORE_LEGACY_BASE_URL"))
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| format!("http://127.0.0.1:{dashboard_port}"));
        let token = env::var("AGENTPROXY_INTERNAL_SERVICE_TOKEN")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .ok_or("AGENTPROXY_INTERNAL_SERVICE_TOKEN is required")?;
        let shutdown_drain_timeout = env_duration_ms(
            "AGENTPROXY_RUST_CORE_SHUTDOWN_DRAIN_MS",
            "AGENTPROXY_RUST_CORE_SHUTDOWN_DRAIN_MS",
            DEFAULT_SHUTDOWN_DRAIN_MS,
        )?;

        Ok(Self {
            listen_addr,
            snapshot_url,
            legacy_base_url,
            token,
            shutdown_drain_timeout,
        })
    }
}

fn env_port(name: &str, default: u16) -> Result<u16, Box<dyn std::error::Error>> {
    match env::var(name) {
        Ok(value) if !value.trim().is_empty() => Ok(value.parse::<u16>()?),
        _ => Ok(default),
    }
}

fn env_duration_ms(
    primary: &str,
    legacy: &str,
    default_ms: u64,
) -> Result<Duration, Box<dyn std::error::Error>> {
    let configured = env::var(primary)
        .or_else(|_| env::var(legacy))
        .ok()
        .filter(|value| !value.trim().is_empty());
    let Some(value) = configured else {
        return Ok(Duration::from_millis(default_ms));
    };
    Ok(parse_duration_ms(primary, &value)?)
}

fn parse_duration_ms(name: &str, value: &str) -> Result<Duration, std::io::Error> {
    let millis = value.trim().parse::<u64>().map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("{name} must be a positive integer number of milliseconds"),
        )
    })?;
    if millis == 0 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("{name} must be greater than zero"),
        ));
    }
    Ok(Duration::from_millis(millis))
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
            .redirect(reqwest::redirect::Policy::none())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shutdown_drain_duration_requires_positive_integer_milliseconds() {
        assert_eq!(
            parse_duration_ms("TEST_SHUTDOWN_DRAIN_MS", "250")
                .expect("valid duration should parse"),
            Duration::from_millis(250)
        );
        assert!(parse_duration_ms("TEST_SHUTDOWN_DRAIN_MS", "0").is_err());
        assert!(parse_duration_ms("TEST_SHUTDOWN_DRAIN_MS", "not-a-number").is_err());
    }
}
