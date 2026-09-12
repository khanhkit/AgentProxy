use axum::{
    extract::{
        ws::{Message as DownstreamMessage, WebSocket, WebSocketUpgrade},
        OriginalUri, State,
    },
    http::{header, HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Message as UpstreamMessage},
};

use crate::AppState;

pub async fn proxy_ws(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
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

    let (upstream, upstream_response) = match connect_async(upstream_request).await {
        Ok(pair) => pair,
        Err(_) => {
            return error_response(
                StatusCode::BAD_GATEWAY,
                "legacy WebSocket upstream unavailable",
            )
        }
    };

    let selected_protocol = upstream_response
        .headers()
        .get(header::SEC_WEBSOCKET_PROTOCOL)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let ws = if let Some(protocol) = selected_protocol {
        ws.protocols([protocol])
    } else {
        ws
    };

    ws.on_upgrade(move |downstream| relay(downstream, upstream))
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
) {
    loop {
        tokio::select! {
            downstream_message = downstream.recv() => {
                let Some(Ok(message)) = downstream_message else { break; };
                if let Some(message) = downstream_to_upstream(message) {
                    let is_close = matches!(message, UpstreamMessage::Close(_));
                    if upstream.send(message).await.is_err() || is_close {
                        break;
                    }
                }
            }
            upstream_message = upstream.next() => {
                let Some(Ok(message)) = upstream_message else { break; };
                if let Some(message) = upstream_to_downstream(message) {
                    let is_close = matches!(message, DownstreamMessage::Close(_));
                    if downstream.send(message).await.is_err() || is_close {
                        break;
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
        DownstreamMessage::Close(_) => Some(UpstreamMessage::Close(None)),
    }
}

fn upstream_to_downstream(message: UpstreamMessage) -> Option<DownstreamMessage> {
    match message {
        UpstreamMessage::Text(value) => Some(DownstreamMessage::Text(value.to_string().into())),
        UpstreamMessage::Binary(value) => Some(DownstreamMessage::Binary(value.to_vec().into())),
        UpstreamMessage::Ping(value) => Some(DownstreamMessage::Ping(value.to_vec().into())),
        UpstreamMessage::Pong(value) => Some(DownstreamMessage::Pong(value.to_vec().into())),
        UpstreamMessage::Close(_) => Some(DownstreamMessage::Close(None)),
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
