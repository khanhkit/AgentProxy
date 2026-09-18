use axum::{
    extract::{
        ws::{
            CloseFrame as DownstreamCloseFrame, Message as DownstreamMessage, WebSocket,
            WebSocketUpgrade,
        },
        OriginalUri, State,
    },
    http::{header, HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use std::{future::Future, time::Duration};

use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{
        client::IntoClientRequest,
        protocol::{CloseFrame as UpstreamCloseFrame, WebSocketConfig},
        Message as UpstreamMessage,
    },
};

use crate::{shutdown::wait_for_force_shutdown, AppState};

const WS_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
const WS_SEND_TIMEOUT: Duration = Duration::from_secs(30);
const WS_READ_BUFFER_SIZE: usize = 128 * 1024;
const WS_WRITE_BUFFER_SIZE: usize = 128 * 1024;
const WS_MAX_MESSAGE_SIZE: usize = 64 * 1024 * 1024;
const WS_MAX_FRAME_SIZE: usize = 16 * 1024 * 1024;
const WS_MAX_WRITE_BUFFER_SIZE: usize = WS_MAX_MESSAGE_SIZE + WS_WRITE_BUFFER_SIZE;

fn legacy_ws_config() -> WebSocketConfig {
    WebSocketConfig::default()
        .read_buffer_size(WS_READ_BUFFER_SIZE)
        .write_buffer_size(WS_WRITE_BUFFER_SIZE)
        .max_write_buffer_size(WS_MAX_WRITE_BUFFER_SIZE)
        .max_message_size(Some(WS_MAX_MESSAGE_SIZE))
        .max_frame_size(Some(WS_MAX_FRAME_SIZE))
}

type LegacyUpstream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

type LegacyUpstreamResponse = tokio_tungstenite::tungstenite::handshake::client::Response;

#[derive(Debug)]
enum UpstreamConnectError {
    Failed(tokio_tungstenite::tungstenite::Error),
    TimedOut,
}

#[derive(Debug)]
enum TimedSendError<E> {
    Send(E),
    TimedOut,
}

async fn connect_upstream<R>(
    request: R,
    timeout: Duration,
) -> Result<(LegacyUpstream, LegacyUpstreamResponse), UpstreamConnectError>
where
    R: IntoClientRequest + Unpin,
{
    match tokio::time::timeout(
        timeout,
        connect_async_with_config(request, Some(legacy_ws_config()), false),
    )
    .await
    {
        Ok(Ok(pair)) => Ok(pair),
        Ok(Err(error)) => Err(UpstreamConnectError::Failed(error)),
        Err(_) => Err(UpstreamConnectError::TimedOut),
    }
}

async fn send_with_timeout<F, E>(future: F, timeout: Duration) -> Result<(), TimedSendError<E>>
where
    F: Future<Output = Result<(), E>>,
{
    match tokio::time::timeout(timeout, future).await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(error)) => Err(TimedSendError::Send(error)),
        Err(_) => Err(TimedSendError::TimedOut),
    }
}

pub async fn proxy_ws(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if state.is_draining() {
        return error_response(StatusCode::SERVICE_UNAVAILABLE, "gateway is shutting down");
    }
    let mut force_shutdown = state.force_shutdown_receiver();

    let Some(base_url) = state.legacy_base_url() else {
        return error_response(
            StatusCode::BAD_GATEWAY,
            "legacy WebSocket target is not configured",
        );
    };
    let Some(target) = websocket_target(
        &base_url,
        uri.path_and_query()
            .map(|value| value.as_str())
            .unwrap_or(uri.path()),
    ) else {
        return error_response(
            StatusCode::BAD_GATEWAY,
            "legacy WebSocket target is invalid",
        );
    };

    let mut upstream_request = match target.into_client_request() {
        Ok(request) => request,
        Err(_) => {
            return error_response(
                StatusCode::BAD_GATEWAY,
                "failed to build legacy WebSocket request",
            )
        }
    };
    copy_ws_headers(&headers, upstream_request.headers_mut());

    let (upstream, upstream_response) = tokio::select! {
        biased;
        _ = wait_for_force_shutdown(&mut force_shutdown) => {
            return error_response(
                StatusCode::SERVICE_UNAVAILABLE,
                "gateway shutdown drain deadline exceeded",
            );
        }
        result = connect_upstream(upstream_request, WS_HANDSHAKE_TIMEOUT) => match result {
            Ok(pair) => pair,
            Err(UpstreamConnectError::Failed(error)) => {
                eprintln!("[legacy-ws] upstream handshake failed: {error}");
                return error_response(
                    StatusCode::BAD_GATEWAY,
                    "legacy WebSocket upstream unavailable",
                );
            }
            Err(UpstreamConnectError::TimedOut) => {
                eprintln!("[legacy-ws] upstream handshake timed out");
                return error_response(
                    StatusCode::GATEWAY_TIMEOUT,
                    "legacy WebSocket upstream handshake timed out",
                );
            }
        }
    };

    let selected_protocol = upstream_response
        .headers()
        .get(header::SEC_WEBSOCKET_PROTOCOL)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let ws = ws
        .write_buffer_size(WS_WRITE_BUFFER_SIZE)
        .max_write_buffer_size(WS_MAX_WRITE_BUFFER_SIZE)
        .max_message_size(WS_MAX_MESSAGE_SIZE)
        .max_frame_size(WS_MAX_FRAME_SIZE);
    let ws = if let Some(protocol) = selected_protocol {
        ws.protocols([protocol])
    } else {
        ws
    };

    ws.on_upgrade(move |downstream| relay(downstream, upstream, force_shutdown))
        .into_response()
}

fn websocket_target(base_url: &str, path_and_query: &str) -> Option<String> {
    if let Some(rest) = base_url.strip_prefix("http://") {
        Some(format!("ws://{rest}{path_and_query}"))
    } else if let Some(rest) = base_url.strip_prefix("https://") {
        Some(format!("wss://{rest}{path_and_query}"))
    } else if base_url.starts_with("ws://") || base_url.starts_with("wss://") {
        Some(format!(
            "{}{path_and_query}",
            base_url.trim_end_matches('/')
        ))
    } else {
        None
    }
}

fn copy_ws_headers(source: &HeaderMap, target: &mut HeaderMap) {
    for (name, value) in source {
        if should_forward_ws_header(name) {
            target.append(name.clone(), value.clone());
        }
    }
}

fn should_forward_ws_header(name: &HeaderName) -> bool {
    !matches!(
        name.as_str().to_ascii_lowercase().as_str(),
        "host"
            | "connection"
            | "upgrade"
            | "sec-websocket-key"
            | "sec-websocket-version"
            | "sec-websocket-extensions"
            | "content-length"
            | "transfer-encoding"
    )
}

async fn relay(
    mut downstream: WebSocket,
    mut upstream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    mut force_shutdown: tokio::sync::watch::Receiver<bool>,
) {
    loop {
        tokio::select! {
            biased;
            _ = wait_for_force_shutdown(&mut force_shutdown) => {
                let reason = "gateway shutdown drain deadline exceeded";
                eprintln!("[legacy-ws] forcing shutdown after drain deadline");
                let _ = send_with_timeout(
                    downstream.send(DownstreamMessage::Close(Some(DownstreamCloseFrame {
                        code: 1012,
                        reason: reason.into(),
                    }))),
                    Duration::from_secs(1),
                )
                .await;
                let _ = send_with_timeout(
                    upstream.send(UpstreamMessage::Close(Some(UpstreamCloseFrame {
                        code: 1012.into(),
                        reason: reason.into(),
                    }))),
                    Duration::from_secs(1),
                )
                .await;
                break;
            }
            downstream_message = downstream.recv() => {
                let message = match downstream_message {
                    Some(Ok(message)) => message,
                    Some(Err(error)) => {
                        eprintln!("[legacy-ws] downstream receive failed: {error}");
                        break;
                    }
                    None => break,
                };
                if let Some(message) = downstream_to_upstream(message) {
                    let is_close = matches!(message, UpstreamMessage::Close(_));
                    match send_with_timeout(upstream.send(message), WS_SEND_TIMEOUT).await {
                        Ok(()) => {
                            if is_close {
                                break;
                            }
                        }
                        Err(TimedSendError::Send(error)) => {
                            eprintln!("[legacy-ws] upstream send failed: {error}");
                            break;
                        }
                        Err(TimedSendError::TimedOut) => {
                            eprintln!("[legacy-ws] upstream send timed out");
                            break;
                        }
                    }
                }
            }
            upstream_message = upstream.next() => {
                let message = match upstream_message {
                    Some(Ok(message)) => message,
                    Some(Err(error)) => {
                        eprintln!("[legacy-ws] upstream receive failed: {error}");
                        break;
                    }
                    None => break,
                };
                if let Some(message) = upstream_to_downstream(message) {
                    let is_close = matches!(message, DownstreamMessage::Close(_));
                    match send_with_timeout(downstream.send(message), WS_SEND_TIMEOUT).await {
                        Ok(()) => {
                            if is_close {
                                break;
                            }
                        }
                        Err(TimedSendError::Send(error)) => {
                            eprintln!("[legacy-ws] downstream send failed: {error}");
                            break;
                        }
                        Err(TimedSendError::TimedOut) => {
                            eprintln!("[legacy-ws] downstream send timed out");
                            break;
                        }
                    }
                }
            }
        }
    }
}

fn downstream_to_upstream(message: DownstreamMessage) -> Option<UpstreamMessage> {
    match message {
        DownstreamMessage::Text(value) => Some(UpstreamMessage::Text(value.to_string().into())),
        DownstreamMessage::Binary(value) => Some(UpstreamMessage::Binary(value.to_vec().into())),
        DownstreamMessage::Ping(value) => Some(UpstreamMessage::Ping(value.to_vec().into())),
        DownstreamMessage::Pong(value) => Some(UpstreamMessage::Pong(value.to_vec().into())),
        DownstreamMessage::Close(frame) => Some(UpstreamMessage::Close(frame.map(|frame| {
            UpstreamCloseFrame {
                code: frame.code.into(),
                reason: frame.reason.to_string().into(),
            }
        }))),
    }
}

fn upstream_to_downstream(message: UpstreamMessage) -> Option<DownstreamMessage> {
    match message {
        UpstreamMessage::Text(value) => Some(DownstreamMessage::Text(value.to_string().into())),
        UpstreamMessage::Binary(value) => Some(DownstreamMessage::Binary(value.to_vec().into())),
        UpstreamMessage::Ping(value) => Some(DownstreamMessage::Ping(value.to_vec().into())),
        UpstreamMessage::Pong(value) => Some(DownstreamMessage::Pong(value.to_vec().into())),
        UpstreamMessage::Close(frame) => Some(DownstreamMessage::Close(frame.map(|frame| {
            DownstreamCloseFrame {
                code: frame.code.into(),
                reason: frame.reason.to_string().into(),
            }
        }))),
        UpstreamMessage::Frame(_) => None,
    }
}

fn error_response(status: StatusCode, message: &str) -> Response {
    let body = serde_json::json!({
        "error": {
            "message": message,
            "type": "gateway_error"
        }
    });
    (
        status,
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        )],
        body.to_string(),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{app as build_app, AppState};
    use std::{convert::Infallible, net::SocketAddr};
    use tokio::{net::TcpListener, task::JoinHandle};
    use tokio_tungstenite::{
        accept_async, connect_async,
        tungstenite::{error::CapacityError, Error as WsError},
    };

    async fn spawn_gateway_with_state(state: AppState) -> (SocketAddr, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("gateway listener should bind");
        let addr = listener
            .local_addr()
            .expect("gateway listener should have local address");
        let router = build_app(state);
        let task = tokio::spawn(async move {
            axum::serve(listener, router)
                .await
                .expect("gateway test server should run");
        });
        (addr, task)
    }

    async fn spawn_gateway(upstream_addr: SocketAddr) -> (SocketAddr, JoinHandle<()>) {
        spawn_gateway_with_state(AppState::new_with_legacy_base_url(format!(
            "http://{upstream_addr}"
        )))
        .await
    }

    async fn spawn_single_message_server(message: UpstreamMessage) -> (SocketAddr, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("upstream listener should bind");
        let addr = listener
            .local_addr()
            .expect("upstream listener should have local address");
        let task = tokio::spawn(async move {
            let (stream, _) = listener
                .accept()
                .await
                .expect("upstream connection should arrive");
            let mut socket = accept_async(stream)
                .await
                .expect("upstream websocket handshake should succeed");
            socket
                .send(message)
                .await
                .expect("upstream test message should send");
        });
        (addr, task)
    }

    async fn receive_capacity_error(
        payload_len: usize,
        max_message_size: usize,
        max_frame_size: usize,
    ) -> WsError {
        let (addr, server_task) =
            spawn_single_message_server(UpstreamMessage::Text("x".repeat(payload_len).into()))
                .await;
        let config = WebSocketConfig::default()
            .max_message_size(Some(max_message_size))
            .max_frame_size(Some(max_frame_size));
        let (mut client, _) =
            connect_async_with_config(format!("ws://{addr}/limits"), Some(config), false)
                .await
                .expect("test websocket client should connect");
        let message = tokio::time::timeout(Duration::from_secs(1), client.next())
            .await
            .expect("oversized message decision should be bounded")
            .expect("server should produce one websocket item");
        server_task.abort();
        message.expect_err("oversized websocket payload must be rejected")
    }

    #[test]
    fn ap_iss_0083_legacy_config_is_explicit_and_finite() {
        let config = legacy_ws_config();
        assert_eq!(config.read_buffer_size, WS_READ_BUFFER_SIZE);
        assert_eq!(config.write_buffer_size, WS_WRITE_BUFFER_SIZE);
        assert_eq!(config.max_write_buffer_size, WS_MAX_WRITE_BUFFER_SIZE);
        assert_eq!(config.max_message_size, Some(WS_MAX_MESSAGE_SIZE));
        assert_eq!(config.max_frame_size, Some(WS_MAX_FRAME_SIZE));
        assert!(config.max_write_buffer_size > config.write_buffer_size);
        assert!(config.max_write_buffer_size >= WS_MAX_MESSAGE_SIZE + config.write_buffer_size);
    }

    #[test]
    fn ap_iss_0083_close_conversion_preserves_code_and_reason() {
        let downstream = DownstreamMessage::Close(Some(DownstreamCloseFrame {
            code: 1008,
            reason: "policy-0083".into(),
        }));
        let converted = downstream_to_upstream(downstream)
            .expect("downstream close should map to upstream close");
        let UpstreamMessage::Close(Some(frame)) = converted else {
            panic!("expected upstream close frame");
        };
        assert_eq!(u16::from(frame.code), 1008);
        assert_eq!(frame.reason.as_str(), "policy-0083");

        let upstream = UpstreamMessage::Close(Some(UpstreamCloseFrame {
            code: 1001u16.into(),
            reason: "maintenance-0083".into(),
        }));
        let converted = upstream_to_downstream(upstream)
            .expect("upstream close should map to downstream close");
        let DownstreamMessage::Close(Some(frame)) = converted else {
            panic!("expected downstream close frame");
        };
        assert_eq!(frame.code, 1001);
        assert_eq!(frame.reason.as_str(), "maintenance-0083");
    }

    #[tokio::test]
    async fn ap_iss_0083_stalled_handshake_times_out() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("stalled listener should bind");
        let addr = listener
            .local_addr()
            .expect("stalled listener should have local address");
        let stall = tokio::spawn(async move {
            let (_stream, _) = listener
                .accept()
                .await
                .expect("gateway should connect to stalled upstream");
            tokio::time::sleep(Duration::from_secs(1)).await;
        });

        let result =
            connect_upstream(format!("ws://{addr}/stalled"), Duration::from_millis(25)).await;
        assert!(matches!(result, Err(UpstreamConnectError::TimedOut)));
        stall.abort();
    }

    #[tokio::test]
    async fn ap_iss_0083_slow_writer_future_is_bounded() {
        let stalled = std::future::pending::<Result<(), Infallible>>();
        let result = send_with_timeout(stalled, Duration::from_millis(25)).await;
        assert!(matches!(result, Err(TimedSendError::TimedOut)));
    }

    #[tokio::test]
    async fn ap_iss_0083_oversized_frame_is_rejected() {
        let error = receive_capacity_error(256, 1024, 64).await;
        assert!(matches!(
            error,
            WsError::Capacity(CapacityError::MessageTooLong { max_size: 64, .. })
        ));
    }

    #[tokio::test]
    async fn ap_iss_0083_oversized_message_is_rejected() {
        let error = receive_capacity_error(256, 64, 1024).await;
        assert!(matches!(
            error,
            WsError::Capacity(CapacityError::MessageTooLong { max_size: 64, .. })
        ));
    }

    #[tokio::test]
    async fn ap_iss_0083_upstream_close_survives_gateway_end_to_end() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("upstream listener should bind");
        let upstream_addr = listener
            .local_addr()
            .expect("upstream listener should have local address");
        let upstream_task = tokio::spawn(async move {
            let (stream, _) = listener
                .accept()
                .await
                .expect("gateway upstream connection should arrive");
            let mut socket = accept_async(stream)
                .await
                .expect("upstream websocket handshake should succeed");
            socket
                .send(UpstreamMessage::Close(Some(UpstreamCloseFrame {
                    code: 1001u16.into(),
                    reason: "maintenance-0083".into(),
                })))
                .await
                .expect("upstream close should send");
        });
        let (gateway_addr, gateway_task) = spawn_gateway(upstream_addr).await;
        let (mut client, _) = connect_async(format!("ws://{gateway_addr}/responses"))
            .await
            .expect("downstream client should connect through gateway");

        let message = tokio::time::timeout(Duration::from_secs(1), client.next())
            .await
            .expect("downstream close should arrive within bound")
            .expect("downstream websocket should yield a close")
            .expect("downstream websocket close should be valid");
        let UpstreamMessage::Close(Some(frame)) = message else {
            panic!("expected downstream client close frame");
        };
        assert_eq!(u16::from(frame.code), 1001);
        assert_eq!(frame.reason.as_str(), "maintenance-0083");

        gateway_task.abort();
        upstream_task
            .await
            .expect("upstream close fixture should complete");
    }

    #[tokio::test]
    async fn ap_iss_0083_downstream_close_survives_gateway_end_to_end() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("upstream listener should bind");
        let upstream_addr = listener
            .local_addr()
            .expect("upstream listener should have local address");
        let (close_tx, close_rx) = tokio::sync::oneshot::channel();
        let upstream_task = tokio::spawn(async move {
            let (stream, _) = listener
                .accept()
                .await
                .expect("gateway upstream connection should arrive");
            let mut socket = accept_async(stream)
                .await
                .expect("upstream websocket handshake should succeed");
            let message = socket
                .next()
                .await
                .expect("gateway should relay downstream close")
                .expect("relayed close should be valid");
            let frame = match message {
                UpstreamMessage::Close(frame) => frame,
                other => panic!("expected upstream close, got {other:?}"),
            };
            let _ = close_tx.send(frame);
        });
        let (gateway_addr, gateway_task) = spawn_gateway(upstream_addr).await;
        let (mut client, _) = connect_async(format!("ws://{gateway_addr}/responses"))
            .await
            .expect("downstream client should connect through gateway");
        client
            .send(UpstreamMessage::Close(Some(UpstreamCloseFrame {
                code: 1008u16.into(),
                reason: "policy-0083".into(),
            })))
            .await
            .expect("downstream close should send");

        let frame = tokio::time::timeout(Duration::from_secs(1), close_rx)
            .await
            .expect("upstream close should arrive within bound")
            .expect("upstream close fixture should report frame")
            .expect("relayed close must preserve frame");
        assert_eq!(u16::from(frame.code), 1008);
        assert_eq!(frame.reason.as_str(), "policy-0083");

        gateway_task.abort();
        upstream_task
            .await
            .expect("upstream close fixture should complete");
    }

    #[tokio::test]
    async fn ap_iss_0090_draining_rejects_new_websocket_upgrade() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("upstream listener should bind");
        let upstream_addr = listener
            .local_addr()
            .expect("upstream listener should have local address");
        let state = AppState::new_with_legacy_base_url(format!("http://{upstream_addr}"));
        state.begin_shutdown();
        let (gateway_addr, gateway_task) = spawn_gateway_with_state(state).await;

        let error = connect_async(format!("ws://{gateway_addr}/responses"))
            .await
            .expect_err("draining gateway must reject new websocket upgrades");
        let WsError::Http(response) = error else {
            panic!("expected HTTP rejection while draining");
        };
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);

        gateway_task.abort();
        drop(listener);
    }

    #[tokio::test]
    async fn ap_iss_0090_force_shutdown_closes_active_websocket_with_observable_reason() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("upstream listener should bind");
        let upstream_addr = listener
            .local_addr()
            .expect("upstream listener should have local address");
        let upstream_task = tokio::spawn(async move {
            let (stream, _) = listener
                .accept()
                .await
                .expect("gateway upstream connection should arrive");
            let mut socket = accept_async(stream)
                .await
                .expect("upstream websocket handshake should succeed");
            let message = tokio::time::timeout(Duration::from_secs(1), socket.next())
                .await
                .expect("forced shutdown should close upstream within bound")
                .expect("upstream websocket should yield a close")
                .expect("upstream close should be valid");
            let UpstreamMessage::Close(Some(frame)) = message else {
                panic!("expected upstream shutdown close frame");
            };
            assert_eq!(u16::from(frame.code), 1012);
            assert_eq!(
                frame.reason.as_str(),
                "gateway shutdown drain deadline exceeded"
            );
        });
        let state = AppState::new_with_legacy_base_url(format!("http://{upstream_addr}"));
        let control = state.clone();
        let (gateway_addr, gateway_task) = spawn_gateway_with_state(state).await;
        let (mut client, _) = connect_async(format!("ws://{gateway_addr}/responses"))
            .await
            .expect("downstream client should connect through gateway");

        control.begin_shutdown();
        control.force_shutdown();

        let message = tokio::time::timeout(Duration::from_secs(1), client.next())
            .await
            .expect("forced shutdown should close downstream within bound")
            .expect("downstream websocket should yield a close")
            .expect("downstream close should be valid");
        let UpstreamMessage::Close(Some(frame)) = message else {
            panic!("expected downstream shutdown close frame");
        };
        assert_eq!(u16::from(frame.code), 1012);
        assert_eq!(
            frame.reason.as_str(),
            "gateway shutdown drain deadline exceeded"
        );

        gateway_task.abort();
        upstream_task
            .await
            .expect("upstream shutdown fixture should complete");
    }
}
