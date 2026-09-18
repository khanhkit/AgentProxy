use std::{
    future::{Future, IntoFuture},
    time::Duration,
};

/// Outcome of the gateway server lifecycle around a shutdown signal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShutdownOutcome {
    /// The server exited before any shutdown signal was received.
    ServerExited,
    /// Existing requests completed within the configured graceful-drain window.
    Drained,
    /// The graceful-drain deadline expired, forced-session cancellation was requested,
    /// and the server then stopped within the bounded settle window.
    DeadlineExceeded,
    /// Even forced-session cancellation did not stop the server within the final bound.
    HardDeadlineExceeded,
}

/// Wait for a server until shutdown, allowing one graceful drain window followed by
/// one short forced-session cancellation window. The callbacks keep transport-specific
/// admission/cancellation policy outside this generic timing state machine.
pub async fn await_bounded_shutdown<I, S, Begin, Force, E>(
    server: I,
    shutdown_signal: S,
    drain_timeout: Duration,
    force_settle_timeout: Duration,
    begin_shutdown: Begin,
    force_shutdown: Force,
) -> Result<ShutdownOutcome, E>
where
    I: IntoFuture<Output = Result<(), E>>,
    S: Future<Output = ()>,
    Begin: FnOnce(),
    Force: FnOnce(),
{
    let server = server.into_future();
    tokio::pin!(server);
    tokio::pin!(shutdown_signal);

    tokio::select! {
        result = &mut server => {
            result?;
            Ok(ShutdownOutcome::ServerExited)
        }
        _ = &mut shutdown_signal => {
            begin_shutdown();
            match tokio::time::timeout(drain_timeout, &mut server).await {
                Ok(result) => {
                    result?;
                    Ok(ShutdownOutcome::Drained)
                }
                Err(_) => {
                    force_shutdown();
                    match tokio::time::timeout(force_settle_timeout, &mut server).await {
                        Ok(result) => {
                            result?;
                            Ok(ShutdownOutcome::DeadlineExceeded)
                        }
                        Err(_) => Ok(ShutdownOutcome::HardDeadlineExceeded),
                    }
                }
            }
        }
    }
}

/// Await the transition used to terminate long-lived request/stream tasks after the
/// graceful drain deadline. A closed sender is treated as cancellation as well.
pub async fn wait_for_force_shutdown(receiver: &mut tokio::sync::watch::Receiver<bool>) {
    loop {
        if *receiver.borrow() {
            return;
        }
        if receiver.changed().await.is_err() {
            return;
        }
    }
}
