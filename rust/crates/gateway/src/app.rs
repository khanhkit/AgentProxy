use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};

use crate::{
    routes::{
        codex::responses,
        health::{healthz, readyz},
        legacy::proxy as legacy_proxy,
        legacy_ws::proxy_ws,
    },
    AppState,
};

const MAX_REQUEST_BODY_BYTES: usize = 64 * 1024 * 1024;

pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/v1/responses", post(responses).get(proxy_ws))
        // Local token counting belongs to the legacy control plane; never forward it to Codex upstream.
        .route("/v1/responses/input_tokens", post(legacy_proxy))
        .route("/v1/responses/{*rest}", post(responses).get(proxy_ws))
        .route("/responses", get(proxy_ws))
        .route("/api/v1/responses", get(proxy_ws))
        .fallback(legacy_proxy)
        .layer(DefaultBodyLimit::max(MAX_REQUEST_BODY_BYTES))
        .with_state(state)
}
