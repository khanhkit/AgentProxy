use std::{
    io::{Read, Write},
    net::SocketAddr,
    thread,
    time::Duration as StdDuration,
};

use agentproxy_control_protocol::snapshot::{
    ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
};
use agentproxy_gateway::{app, AppState};
use futures_util::stream;
use reqwest::StatusCode;
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    task::JoinHandle,
    time::{sleep, timeout, Duration},
};

const ROUTE_LIMIT: usize = 16 * 1024 * 1024;
const TEST_KEY: &str = "kittest-native-key";

fn install_native_state(base_url: &str, max_concurrent: Option<u32>) -> AppState {
    let state = AppState::new();
    let mut snapshot = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 1);
    snapshot.codex_connections.push(CodexConnectionConfig {
        id: "kittest-account".to_owned(),
        access_token: "kittest-upstream-token".to_owned(),
        workspace_id: None,
        base_url: base_url.to_owned(),
        max_concurrent,
        credential_version: 1,
    });
    snapshot.api_keys.push(ApiKeyConfig {
        id: "kittest-key".to_owned(),
        key_hash: format!("{:x}", Sha256::digest(TEST_KEY.as_bytes())),
        allowed_connections: vec!["kittest-account".to_owned()],
        allowed_endpoints: vec!["chat".to_owned()],
        unsupported_policy: false,
    });
    snapshot.codex_native_models.push("gpt-test".to_owned());
    snapshot.codex_catalog_models.push("gpt-test".to_owned());
    state
        .install_snapshot(snapshot, true)
        .expect("KitTest snapshot should install");
    state
}

async fn spawn_gateway(state: AppState) -> (SocketAddr, JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind KitTest gateway listener");
    let addr = listener
        .local_addr()
        .expect("read KitTest gateway listener address");
    let server = tokio::spawn(async move {
        axum::serve(listener, app(state))
            .await
            .expect("KitTest gateway fixture should remain available");
    });
    (addr, server)
}

async fn raw_request_without_body(addr: SocketAddr, headers: &str) -> String {
    let mut socket = TcpStream::connect(addr)
        .await
        .expect("connect KitTest raw HTTP client");
    socket
        .write_all(headers.as_bytes())
        .await
        .expect("write KitTest raw request headers");
    socket.flush().await.expect("flush KitTest raw request");

    let mut response = Vec::new();
    timeout(Duration::from_secs(3), async {
        loop {
            let mut chunk = [0u8; 4096];
            let read = socket
                .read(&mut chunk)
                .await
                .expect("read KitTest raw response");
            if read == 0 {
                break;
            }
            response.extend_from_slice(&chunk[..read]);

            let Some(header_end) = response.windows(4).position(|window| window == b"\r\n\r\n")
            else {
                continue;
            };
            let header_end = header_end + 4;
            let header_text = String::from_utf8_lossy(&response[..header_end]);
            let content_length = header_text.lines().find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then(|| value.trim().parse::<usize>().ok())
                    .flatten()
            });
            match content_length {
                Some(length) if response.len() >= header_end + length => break,
                Some(_) => continue,
                None => break,
            }
        }
    })
    .await
    .expect("gateway must reject before waiting for the withheld body");
    String::from_utf8_lossy(&response).into_owned()
}

fn assert_http_status(raw: &str, code: u16, tc_id: &str) {
    let expected = format!(" {code} ");
    let first_line = raw.lines().next().unwrap_or_default();
    assert!(
        first_line.contains(&expected),
        "{tc_id}: expected HTTP {code}, got first line {first_line:?}; response={raw:?}"
    );
}

#[tokio::test]
async fn tc_rust_ingress_sec_001_declared_and_malformed_input_rejects_before_body() {
    let (addr, server) =
        spawn_gateway(install_native_state("https://example.invalid", Some(0))).await;

    eprintln!("TC-RUST-INGRESS-SEC-001 cell=oversized start");
    let oversized = raw_request_without_body(
        addr,
        &format!(
            "POST /v1/responses HTTP/1.1\r\nHost: {addr}\r\nAuthorization: Bearer kittest-invalid-key\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            ROUTE_LIMIT + 1
        ),
    )
    .await;
    assert_http_status(&oversized, 413, "TC-RUST-INGRESS-SEC-001");
    assert!(
        oversized.contains("16 MiB"),
        "TC-RUST-INGRESS-SEC-001: oversized response must identify the route limit: {oversized:?}"
    );

    // Hyper normalizes identical duplicate Content-Length fields before the public
    // Router seam, so the handler-level duplicate-header oracle is executed via
    // the existing focused route unit test and recorded separately as evidence.
    eprintln!("TC-RUST-INGRESS-SEC-001 cell=malformed start");
    let malformed = raw_request_without_body(
        addr,
        &format!(
            "POST /v1/responses HTTP/1.1\r\nHost: {addr}\r\nContent-Length: abc\r\nConnection: close\r\n\r\n"
        ),
    )
    .await;
    assert_http_status(&malformed, 400, "TC-RUST-INGRESS-SEC-001");

    server.abort();
}

#[tokio::test]
async fn tc_rust_ingress_sec_002_streamed_body_over_16_mib_returns_413() {
    let (addr, server) = spawn_gateway(AppState::new()).await;
    let chunk = vec![b'x'; ROUTE_LIMIT / 2 + 1];
    let body_stream = stream::iter(vec![
        Ok::<Vec<u8>, std::io::Error>(chunk.clone()),
        Ok::<Vec<u8>, std::io::Error>(chunk),
    ]);

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/responses"))
        .body(reqwest::Body::wrap_stream(body_stream))
        .send()
        .await
        .expect("send streamed KitTest request");
    assert_eq!(
        response.status(),
        StatusCode::PAYLOAD_TOO_LARGE,
        "TC-RUST-INGRESS-SEC-002"
    );
    let body = response.text().await.expect("read 413 response body");
    assert!(
        body.contains("16 MiB"),
        "TC-RUST-INGRESS-SEC-002: response must identify the bounded route limit"
    );

    server.abort();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn tc_rust_ingress_rel_003_saturation_returns_503_without_waiting_for_body() {
    let (addr, server) = spawn_gateway(AppState::new()).await;
    let holder_headers =
        format!("POST /v1/responses HTTP/1.1\r\nHost: {addr}\r\nContent-Length: 1\r\n\r\n");
    let mut holders = Vec::with_capacity(128);
    for _ in 0..128 {
        let mut socket = TcpStream::connect(addr)
            .await
            .expect("connect ingress holder");
        socket
            .write_all(holder_headers.as_bytes())
            .await
            .expect("write ingress holder headers");
        socket.flush().await.expect("flush ingress holder");
        holders.push(socket);
    }

    // Give each accepted connection an opportunity to enter body collection and hold its permit.
    sleep(Duration::from_millis(300)).await;

    let overloaded = raw_request_without_body(
        addr,
        &format!(
            "POST /v1/responses HTTP/1.1\r\nHost: {addr}\r\nContent-Length: 1\r\nConnection: close\r\n\r\n"
        ),
    )
    .await;
    assert_http_status(&overloaded, 503, "TC-RUST-INGRESS-REL-003");
    assert!(
        overloaded.to_ascii_lowercase().contains("retry-after: 1"),
        "TC-RUST-INGRESS-REL-003: expected Retry-After: 1, response={overloaded:?}"
    );
    assert!(
        overloaded.contains("gateway ingress capacity exhausted"),
        "TC-RUST-INGRESS-REL-003: expected overload error envelope"
    );

    drop(holders);
    sleep(Duration::from_millis(100)).await;

    let recovered = reqwest::Client::new()
        .post(format!("http://{addr}/v1/responses"))
        .header("content-type", "application/json")
        .body(r#"{"model":"legacy-model","input":"hello"}"#)
        .send()
        .await
        .expect("send post-saturation recovery request");
    assert_eq!(
        recovered.status(),
        StatusCode::NOT_FOUND,
        "TC-RUST-INGRESS-REL-003: capacity must recover after holders are released"
    );

    server.abort();
}

#[tokio::test]
async fn tc_rust_ingress_reg_004_native_and_legacy_under_cap_contracts_remain_distinct() {
    let state = install_native_state("https://example.invalid", Some(0));
    let (addr, server) = spawn_gateway(state).await;
    let client = reqwest::Client::new();

    let unauthorized = client
        .post(format!("http://{addr}/v1/responses"))
        .header("content-type", "application/json")
        .body(r#"{"model":"gpt-test","input":"hello"}"#)
        .send()
        .await
        .expect("send unauthorized native request");
    assert_eq!(
        unauthorized.status(),
        StatusCode::UNAUTHORIZED,
        "TC-RUST-INGRESS-REG-004: native route must enforce native auth"
    );

    let authorized = client
        .post(format!("http://{addr}/v1/responses"))
        .header("authorization", format!("Bearer {TEST_KEY}"))
        .header("content-type", "application/json")
        .body(r#"{"model":"gpt-test","input":"hello"}"#)
        .send()
        .await
        .expect("send authorized native request");
    assert_eq!(
        authorized.status(),
        StatusCode::SERVICE_UNAVAILABLE,
        "TC-RUST-INGRESS-REG-004: valid native auth must reach native account selection"
    );
    let authorized_body = authorized
        .text()
        .await
        .expect("read native selection response");
    assert!(
        authorized_body.contains("no eligible Codex account"),
        "TC-RUST-INGRESS-REG-004: expected native account-selection oracle"
    );

    let legacy = client
        .post(format!("http://{addr}/v1/responses"))
        .header("content-type", "application/json")
        .body(r#"{"model":"legacy-model","input":"hello"}"#)
        .send()
        .await
        .expect("send legacy fallback request");
    assert_eq!(
        legacy.status(),
        StatusCode::NOT_FOUND,
        "TC-RUST-INGRESS-REG-004: legacy fallback must not be rejected by native auth"
    );
    let legacy_body = legacy.text().await.expect("read legacy fallback response");
    assert!(
        legacy_body.contains("legacy control-plane proxy is not configured"),
        "TC-RUST-INGRESS-REG-004: expected legacy fallback oracle"
    );

    server.abort();
}

fn rss_kib(field: &str) -> u64 {
    let status = std::fs::read_to_string("/proc/self/status").expect("Linux proc status available");
    status
        .lines()
        .find_map(|line| {
            let rest = line.strip_prefix(field)?;
            rest.split_whitespace().next()?.parse::<u64>().ok()
        })
        .expect("requested RSS field should exist")
}

#[tokio::test]
#[ignore = "TC-RUST-INGRESS-PERF-005 resource probe; run explicitly"]
async fn tc_rust_ingress_perf_005_near_limit_authorized_request_records_peak_rss() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .expect("bind KitTest loopback upstream listener");
    let upstream_addr = listener
        .local_addr()
        .expect("read KitTest loopback upstream address");
    let upstream = thread::spawn(move || {
        let (mut socket, _) = listener.accept().expect("accept KitTest upstream request");
        socket
            .set_read_timeout(Some(StdDuration::from_secs(20)))
            .expect("configure KitTest upstream read timeout");
        let mut received = Vec::with_capacity(16 * 1024);
        let mut scratch = [0u8; 64 * 1024];
        let header_end = loop {
            let read = socket.read(&mut scratch).expect("read upstream request");
            assert!(read > 0, "upstream closed before headers completed");
            received.extend_from_slice(&scratch[..read]);
            if let Some(index) = received.windows(4).position(|window| window == b"\r\n\r\n") {
                break index + 4;
            }
            assert!(
                received.len() < 64 * 1024,
                "unexpectedly large upstream headers"
            );
        };
        let header_text = String::from_utf8_lossy(&received[..header_end]);
        let content_length = header_text
            .lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then(|| value.trim().parse::<usize>().ok())
                    .flatten()
            })
            .expect("outbound request should declare Content-Length");
        let mut body_received = received.len().saturating_sub(header_end);
        while body_received < content_length {
            let read = socket
                .read(&mut scratch)
                .expect("read upstream request body");
            assert!(read > 0, "upstream closed before request body completed");
            body_received += read;
        }
        socket
            .write_all(
                b"HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
            )
            .expect("write KitTest upstream response");
    });

    let state = install_native_state(&format!("http://{upstream_addr}"), Some(1));
    let (addr, gateway) = spawn_gateway(state).await;
    let baseline_hwm = rss_kib("VmHWM:");
    let padding = "x".repeat(ROUTE_LIMIT - 1024);
    let payload = format!(r#"{{"model":"gpt-test","input":"{padding}"}}"#);
    assert!(
        payload.len() <= ROUTE_LIMIT,
        "resource probe must remain under route cap"
    );

    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/responses"))
        .header("authorization", format!("Bearer {TEST_KEY}"))
        .header("content-type", "application/json")
        .body(payload)
        .send()
        .await
        .expect("send near-limit authorized KitTest request");
    assert_eq!(
        response.status(),
        StatusCode::BAD_REQUEST,
        "TC-RUST-INGRESS-PERF-005: loopback upstream response must propagate"
    );
    upstream
        .join()
        .expect("KitTest upstream thread should finish");
    let peak_hwm = rss_kib("VmHWM:");
    let delta_hwm = peak_hwm.saturating_sub(baseline_hwm);
    eprintln!(
        "TC-RUST-INGRESS-PERF-005 payload_bytes={} baseline_hwm_kib={} peak_hwm_kib={} delta_kib={}",
        ROUTE_LIMIT - 1024,
        baseline_hwm,
        peak_hwm,
        delta_hwm
    );
    assert!(
        peak_hwm >= baseline_hwm,
        "TC-RUST-INGRESS-PERF-005: peak HWM must not decrease"
    );

    gateway.abort();
}
