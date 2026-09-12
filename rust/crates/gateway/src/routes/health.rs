use axum::{extract::State, http::StatusCode};

use crate::AppState;

pub async fn healthz() -> StatusCode {
    StatusCode::OK
}

pub async fn readyz(State(state): State<AppState>) -> StatusCode {
    if state.is_ready() {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    }
}
