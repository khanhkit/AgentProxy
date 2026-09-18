use std::{convert::Infallible, time::Duration};

use agentproxy_gateway::{app, AppState};
use async_stream::stream;
use axum::{
    body::{Body, Bytes},
    http::{Request, StatusCode},
    response::Response,
    routing::{get, post},
    Router,
};
use http_body_util::BodyExt;
use tokio::{
    net::TcpListener,
    time::{sleep, timeout},
};
use tower::ServiceExt;

async fn spawn_legacy_server() -> String {
    async fn models() -> Response {
        Response::builder()
            .status(StatusCode::CREATED)
            .header("content-type", "application/json")
            .header("x-legacy", "yes")
            .body(Body::from(r#"{"object":"list","source":"next"}"#))
            .unwrap()
    }

    async fn chat() -> Response {
        let body = stream! {
            yield Ok::<Bytes, Infallible>(Bytes::from_static(b"data: first\n\n"));
            sleep(Duration::from_millis(350)).await;
            yield Ok::<Bytes, Infallible>(Bytes::from_static(b"data: second\n\n"));
        };
        Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "text/event-stream")
            .body(Body::from_stream(body))
            .unwrap()
    }

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(
            listener,
            Router::new()
                .route("/v1/models", get(models))
                .route("/v1/chat/completions", post(chat)),
        )
        .await
        .unwrap();
    });
    format!("http://{address}")
}

#[tokio::test]
async fn unknown_http_route_is_stream_proxied_to_legacy_next() {
    let legacy = spawn_legacy_server().await;
    let state = AppState::new_with_legacy_base_url(legacy);
    let request = Request::builder()
        .method("GET")
        .uri("/v1/models?source=test")
        .header("authorization", "Bearer legacy-key")
        .body(Body::empty())
        .unwrap();

    let response = app(state.clone()).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED);
    assert_eq!(response.headers().get("x-legacy").unwrap(), "yes");
    let body = response.into_body().collect().await.unwrap().to_bytes();
    assert!(String::from_utf8_lossy(&body).contains("\"source\":\"next\""));
}

#[tokio::test]
async fn legacy_sse_is_not_buffered_by_rust_fallback() {
    let legacy = spawn_legacy_server().await;
    let state = AppState::new_with_legacy_base_url(legacy);
    let request = Request::builder()
        .method("POST")
        .uri("/v1/chat/completions")
        .header("content-type", "application/json")
        .body(Body::from("{}"))
        .unwrap();

    let response = timeout(
        Duration::from_millis(120),
        app(state.clone()).oneshot(request),
    )
    .await
    .expect("proxy must return before delayed second SSE chunk")
    .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let mut body = response.into_body();
    let first = timeout(Duration::from_millis(100), body.frame())
        .await
        .expect("first legacy SSE frame")
        .expect("body frame")
        .expect("stream frame")
        .into_data()
        .expect("data frame");
    assert!(String::from_utf8_lossy(&first).contains("first"));
}

#[tokio::test]
async fn missing_legacy_target_fails_closed() {
    let request = Request::builder()
        .method("GET")
        .uri("/v1/models")
        .body(Body::empty())
        .unwrap();
    let response = app(AppState::new()).oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
