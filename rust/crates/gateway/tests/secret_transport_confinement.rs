use std::{
    net::{IpAddr, Ipv4Addr, UdpSocket},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};

use agentproxy_gateway::{app, sync_snapshot_once, AppState};
use axum::{extract::State, http::HeaderMap, response::Redirect, routing::get, Router};
use tokio::{net::TcpListener, task::JoinHandle};

const INTERNAL_SERVICE_AUTH_HEADER: &str = "x-agentproxy-internal-service-token";
const TEST_TOKEN: &str = "kittest-internal-token";

#[derive(Clone, Default)]
struct HeaderCapture {
    token: Arc<Mutex<Option<String>>>,
}

impl HeaderCapture {
    fn recorded_token(&self) -> Option<String> {
        self.token
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }
}

async fn capture_snapshot(
    State(capture): State<HeaderCapture>,
    headers: HeaderMap,
) -> &'static str {
    let token = headers
        .get(INTERNAL_SERVICE_AUTH_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    *capture
        .token
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = token;

    r#"{"schema_version":1,"source_id":"kittest","generation":1}"#
}

async fn record_legacy_request(State(count): State<Arc<AtomicUsize>>) -> &'static str {
    count.fetch_add(1, Ordering::SeqCst);
    r#"{"ok":true}"#
}

fn spawn_server(listener: TcpListener, router: Router) -> JoinHandle<()> {
    tokio::spawn(async move {
        axum::serve(listener, router)
            .await
            .expect("local KitTest fixture server should stay available");
    })
}

fn local_non_loopback_ipv4() -> Ipv4Addr {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).expect("bind route-probe UDP socket");
    // UDP connect selects a local route/address but sends no packet. The resulting
    // address is then used only to reach a listener in this same test namespace.
    socket
        .connect((Ipv4Addr::new(192, 0, 2, 1), 9))
        .expect("select local non-loopback route");
    match socket
        .local_addr()
        .expect("read route-probe local address")
        .ip()
    {
        IpAddr::V4(ip) if !ip.is_loopback() && !ip.is_unspecified() => ip,
        other => panic!("expected local non-loopback IPv4 address, got {other}"),
    }
}

async fn legacy_request_reaches_upstream(
    base_url: String,
    upstream_count: Arc<AtomicUsize>,
) -> usize {
    let gateway_listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind gateway fixture listener");
    let gateway_addr = gateway_listener
        .local_addr()
        .expect("read gateway fixture address");
    let gateway = spawn_server(
        gateway_listener,
        app(AppState::new_with_legacy_base_url(base_url)),
    );

    let response = reqwest::Client::new()
        .get(format!("http://{gateway_addr}/models"))
        .header("authorization", "Bearer kittest-secret")
        .send()
        .await
        .expect("request local gateway fixture");
    let _ = response.bytes().await;

    gateway.abort();
    upstream_count.load(Ordering::SeqCst)
}

#[tokio::test]
async fn tc_rust_sec_001_cross_origin_redirect_cannot_receive_internal_service_token() {
    let capture = HeaderCapture::default();
    let capture_listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind redirect capture listener");
    let capture_addr = capture_listener
        .local_addr()
        .expect("read redirect capture address");
    let capture_router = Router::new()
        .route("/capture", get(capture_snapshot))
        .with_state(capture.clone());
    let capture_server = spawn_server(capture_listener, capture_router);

    let redirect_target = format!("http://{capture_addr}/capture");
    let redirect_listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind redirect source listener");
    let redirect_addr = redirect_listener
        .local_addr()
        .expect("read redirect source address");
    let redirect_router = Router::new().route(
        "/snapshot",
        get(move || {
            let redirect_target = redirect_target.clone();
            async move { Redirect::temporary(&redirect_target) }
        }),
    );
    let redirect_server = spawn_server(redirect_listener, redirect_router);

    let state = AppState::new();
    let client = reqwest::Client::builder()
        .build()
        .expect("build production-equivalent reqwest client");
    let snapshot_url = format!("http://{redirect_addr}/snapshot");

    let outcome = sync_snapshot_once(&state, &client, &snapshot_url, TEST_TOKEN).await;
    let captured_token = capture.recorded_token();

    redirect_server.abort();
    capture_server.abort();

    assert_ne!(
        captured_token.as_deref(),
        Some(TEST_TOKEN),
        "TC-RUST-SEC-001: cross-origin redirect target received the internal-service token; sync outcome: {outcome:?}"
    );
}

#[tokio::test]
async fn tc_rust_sec_002_non_loopback_cleartext_endpoint_is_rejected_before_transport() {
    let upstream_count = Arc::new(AtomicUsize::new(0));
    let upstream_listener = TcpListener::bind("0.0.0.0:0")
        .await
        .expect("bind non-loopback-capable upstream fixture");
    let upstream_port = upstream_listener
        .local_addr()
        .expect("read upstream fixture address")
        .port();
    let upstream_router = Router::new()
        .fallback(get(record_legacy_request))
        .with_state(Arc::clone(&upstream_count));
    let upstream = spawn_server(upstream_listener, upstream_router);

    let local_non_loopback = local_non_loopback_ipv4();
    let observed = legacy_request_reaches_upstream(
        format!("http://{local_non_loopback}:{upstream_port}"),
        Arc::clone(&upstream_count),
    )
    .await;

    upstream.abort();

    assert_eq!(
        observed, 0,
        "TC-RUST-SEC-002: non-loopback cleartext legacy endpoint received a request"
    );
}

#[tokio::test]
async fn tc_rust_sec_003_loopback_http_remains_supported() {
    let upstream_count = Arc::new(AtomicUsize::new(0));
    let upstream_listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind loopback upstream fixture");
    let upstream_addr = upstream_listener
        .local_addr()
        .expect("read loopback upstream fixture address");
    let upstream_router = Router::new()
        .fallback(get(record_legacy_request))
        .with_state(Arc::clone(&upstream_count));
    let upstream = spawn_server(upstream_listener, upstream_router);

    let observed = legacy_request_reaches_upstream(
        format!("http://{upstream_addr}"),
        Arc::clone(&upstream_count),
    )
    .await;

    upstream.abort();

    assert_eq!(
        observed, 1,
        "TC-RUST-SEC-003: loopback HTTP legacy endpoint should remain usable"
    );
}
