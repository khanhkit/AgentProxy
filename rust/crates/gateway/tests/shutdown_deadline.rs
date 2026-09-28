use std::{sync::Arc, time::Duration};

use agentproxy_account::AccountRuntime;
use agentproxy_gateway::shutdown::{
    await_bounded_shutdown, wait_for_force_shutdown, ShutdownOutcome,
};
use axum::{extract::State, http::StatusCode, routing::get, Router};
use tokio::{
    net::TcpListener,
    sync::{oneshot, watch, Notify},
    time::timeout,
};

#[derive(Clone)]
struct LeaseState {
    runtime: Arc<AccountRuntime>,
    entered: Arc<Notify>,
    force_shutdown: watch::Receiver<bool>,
}

async fn hanging_with_lease(State(state): State<LeaseState>) -> (StatusCode, &'static str) {
    let _lease = state
        .runtime
        .try_acquire()
        .expect("test account lease should be available");
    state.entered.notify_one();
    let mut force_shutdown = state.force_shutdown.clone();
    wait_for_force_shutdown(&mut force_shutdown).await;
    (
        StatusCode::SERVICE_UNAVAILABLE,
        "gateway shutdown drain deadline exceeded",
    )
}

async fn short_with_lease(State(state): State<LeaseState>) -> &'static str {
    let _lease = state
        .runtime
        .try_acquire()
        .expect("test account lease should be available");
    state.entered.notify_one();
    tokio::time::sleep(Duration::from_millis(20)).await;
    "ok"
}

async fn spawn_server(
    router: Router,
    drain_timeout: Duration,
    force_tx: watch::Sender<bool>,
) -> (
    std::net::SocketAddr,
    oneshot::Sender<()>,
    tokio::task::JoinHandle<std::io::Result<ShutdownOutcome>>,
) {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("loopback listener should bind");
    let addr = listener
        .local_addr()
        .expect("listener address should resolve");
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let (drain_tx, drain_rx) = oneshot::channel::<()>();
    let server = axum::serve(listener, router).with_graceful_shutdown(async move {
        let _ = drain_rx.await;
    });

    let task = tokio::spawn(async move {
        await_bounded_shutdown(
            server,
            async move {
                let _ = shutdown_rx.await;
            },
            drain_timeout,
            Duration::from_millis(250),
            || {
                let _ = drain_tx.send(());
            },
            || {
                let _ = force_tx.send(true);
            },
        )
        .await
    });

    (addr, shutdown_tx, task)
}

#[tokio::test]
async fn deadline_forces_long_lived_request_to_release_account_lease() {
    let runtime = Arc::new(AccountRuntime::new("shutdown-test", Some(1)));
    let entered = Arc::new(Notify::new());
    let (force_tx, force_rx) = watch::channel(false);
    let state = LeaseState {
        runtime: Arc::clone(&runtime),
        entered: Arc::clone(&entered),
        force_shutdown: force_rx,
    };
    let router = Router::new()
        .route("/hang", get(hanging_with_lease))
        .with_state(state);
    let (addr, shutdown_tx, server_task) =
        spawn_server(router, Duration::from_millis(50), force_tx).await;

    let client_task = tokio::spawn(async move {
        reqwest::Client::new()
            .get(format!("http://{addr}/hang"))
            .send()
            .await
    });

    timeout(Duration::from_secs(1), entered.notified())
        .await
        .expect("long-lived request should acquire the lease");
    assert_eq!(runtime.in_flight(), 1);

    shutdown_tx
        .send(())
        .expect("shutdown receiver should be live");
    let outcome = timeout(Duration::from_secs(1), server_task)
        .await
        .expect("bounded shutdown must complete")
        .expect("server task should join")
        .expect("server should not return an IO error");

    assert_eq!(outcome, ShutdownOutcome::DeadlineExceeded);
    assert_eq!(
        runtime.in_flight(),
        0,
        "forced shutdown must release the active account lease"
    );

    let response = timeout(Duration::from_secs(1), client_task)
        .await
        .expect("forced shutdown must terminate the long-lived request")
        .expect("client task should join")
        .expect("forced request should receive an observable shutdown response");
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn short_request_finishes_within_drain_deadline() {
    let runtime = Arc::new(AccountRuntime::new("shutdown-short-test", Some(1)));
    let entered = Arc::new(Notify::new());
    let (force_tx, force_rx) = watch::channel(false);
    let state = LeaseState {
        runtime: Arc::clone(&runtime),
        entered: Arc::clone(&entered),
        force_shutdown: force_rx,
    };
    let router = Router::new()
        .route("/short", get(short_with_lease))
        .with_state(state);
    let (addr, shutdown_tx, server_task) =
        spawn_server(router, Duration::from_millis(500), force_tx).await;

    let client_task = tokio::spawn(async move {
        reqwest::Client::new()
            .get(format!("http://{addr}/short"))
            .send()
            .await
    });

    timeout(Duration::from_secs(1), entered.notified())
        .await
        .expect("short request should acquire the lease");
    shutdown_tx
        .send(())
        .expect("shutdown receiver should be live");

    let outcome = timeout(Duration::from_secs(1), server_task)
        .await
        .expect("graceful drain must complete")
        .expect("server task should join")
        .expect("server should not return an IO error");
    assert_eq!(outcome, ShutdownOutcome::Drained);

    let response = client_task
        .await
        .expect("client task should join")
        .expect("short request should finish successfully");
    assert!(response.status().is_success());
    assert_eq!(runtime.in_flight(), 0);
}
