use axum::{
    extract::ws::{Message, WebSocketUpgrade},
    response::Response,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use agentproxy_gateway::{app, AppState};
use tokio::net::TcpListener;
use tokio_tungstenite::{connect_async, tungstenite::Message as ClientMessage};

async fn spawn_legacy_ws() -> String {
    async fn ws(ws: WebSocketUpgrade) -> Response {
        ws.on_upgrade(|socket| async move {
            let (mut tx, mut rx) = socket.split();
            while let Some(Ok(message)) = rx.next().await {
                match message {
                    Message::Text(text) => {
                        if tx
                            .send(Message::Text(format!("next:{text}").into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Message::Binary(data) => {
                        if tx.send(Message::Binary(data)).await.is_err() {
                            break;
                        }
                    }
                    Message::Close(_) => break,
                    Message::Ping(data) => {
                        if tx.send(Message::Pong(data)).await.is_err() {
                            break;
                        }
                    }
                    Message::Pong(_) => {}
                }
            }
        })
    }

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, Router::new().route("/v1/responses", get(ws)))
            .await
            .unwrap();
    });
    format!("http://{address}")
}

#[tokio::test]
async fn responses_websocket_is_bridged_to_legacy_next() {
    let legacy = spawn_legacy_ws().await;
    let state = AppState::new_with_legacy_base_url(legacy);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app(state)).await.unwrap() });

    let (mut socket, _) =
        connect_async(format!("ws://{address}/v1/responses?api_key=client-token"))
            .await
            .expect("connect through Rust gateway");
    socket
        .send(ClientMessage::Text("hello".into()))
        .await
        .unwrap();

    let message = socket.next().await.unwrap().unwrap();
    assert_eq!(message.into_text().unwrap(), "next:hello");
    socket.close(None).await.unwrap();
}
