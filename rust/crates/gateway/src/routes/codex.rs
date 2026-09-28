use std::collections::BTreeMap;

use agentproxy_account::MAX_PROVIDER_COOLDOWN;
use agentproxy_providers::codex::{
    adapter::{CodexAdapter, PrepareError, PreparedRequest, SAFE_CODEX_CLIENT_HEADER_NAMES},
    stream_classifier::{classify_precommit_sse_event, CodexPrecommitClass},
};
use agentproxy_stream::sse::SseFramer;
use async_stream::stream;
use axum::{
    body::{to_bytes, Body, Bytes},
    extract::{OriginalUri, Request, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::Response,
};
use futures_util::StreamExt;

use crate::{
    bounded_response::{read_bounded_response, BoundedResponseError},
    error_boundary::{json_error, json_error_with_diagnostic, provider_error_response},
    lifecycle::{AttemptLifecycleOutcome, RequestLifecycleTracker, RequestOutcome},
    routes::legacy,
    shutdown::wait_for_force_shutdown,
    ApiKeyAuthError, AppState, SelectedCodexAccount,
};

const MAX_RESPONSE_REQUEST_BODY_BYTES: usize = 16 * 1024 * 1024;
const MAX_PRECOMMIT_EVENT_BYTES: usize = 64 * 1024;
const MAX_PRECOMMIT_BUFFER_BYTES: usize = 256 * 1024;
const MAX_CODEX_COMPACT_RESPONSE_BYTES: usize = 64 * 1024 * 1024;
const MAX_CODEX_ERROR_RESPONSE_BYTES: usize = 1024 * 1024;
const MAX_SAFE_UPSTREAM_HEADER_BYTES: usize = 256;
const MAX_CONTINUATION_ID_BYTES: usize = 1024;
const SAFE_UPSTREAM_RESPONSE_HEADER_NAMES: [&str; 19] = [
    "x-request-id",
    "request-id",
    "openai-request-id",
    "x-openai-request-id",
    "x-correlation-id",
    "traceparent",
    "traceresponse",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
    "x-ratelimit-limit-requests",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-reset-requests",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-tokens",
    "ratelimit-limit",
    "ratelimit-remaining",
    "ratelimit-reset",
];
const MAX_CODEX_UPSTREAM_SENDS: u32 = 3;
const MAX_CODEX_CREDENTIAL_SWITCHES: u32 = 2;
const MAX_CODEX_RETRY_ELAPSED: std::time::Duration = std::time::Duration::from_secs(30);
const MAX_CODEX_RETRY_SLEEP: std::time::Duration = std::time::Duration::from_secs(1);
const CODEX_RETRY_BACKOFF_BASE: std::time::Duration = std::time::Duration::from_millis(100);
const MAX_CODEX_REQUEST_PRECOMMIT_BYTES: usize = MAX_PRECOMMIT_BUFFER_BYTES;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ContentLengthError {
    Duplicate,
    Invalid,
    TooLarge,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UpstreamFailureClass {
    Auth,
    RateLimit,
    Transient,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SendFailureClass {
    SafePreSend,
    AmbiguousDelivery,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RetryBackoff {
    None,
    Transient,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RetryBudgetExhausted {
    Sends,
    CredentialSwitches,
    Elapsed,
    Sleep,
    PrecommitBytes,
}

struct RetryBudget {
    started: std::time::Instant,
    sends: u32,
    credential_switches: u32,
    slept: std::time::Duration,
    precommit_bytes: usize,
}

impl RetryBudget {
    fn new() -> Self {
        Self {
            started: std::time::Instant::now(),
            sends: 0,
            credential_switches: 0,
            slept: std::time::Duration::ZERO,
            precommit_bytes: 0,
        }
    }

    fn remaining(&self) -> Result<std::time::Duration, RetryBudgetExhausted> {
        let remaining = MAX_CODEX_RETRY_ELAPSED
            .checked_sub(self.started.elapsed())
            .ok_or(RetryBudgetExhausted::Elapsed)?;
        if remaining.is_zero() {
            Err(RetryBudgetExhausted::Elapsed)
        } else {
            Ok(remaining)
        }
    }

    fn begin_send(&mut self) -> Result<std::time::Duration, RetryBudgetExhausted> {
        if self.sends >= MAX_CODEX_UPSTREAM_SENDS {
            return Err(RetryBudgetExhausted::Sends);
        }
        let remaining = self.remaining()?;
        self.sends += 1;
        Ok(remaining)
    }

    fn note_credential_switch(&mut self) -> Result<(), RetryBudgetExhausted> {
        if self.credential_switches >= MAX_CODEX_CREDENTIAL_SWITCHES {
            return Err(RetryBudgetExhausted::CredentialSwitches);
        }
        self.credential_switches += 1;
        Ok(())
    }

    fn observe_precommit_bytes(&mut self, bytes: usize) -> Result<(), RetryBudgetExhausted> {
        self.precommit_bytes = self.precommit_bytes.saturating_add(bytes);
        if self.precommit_bytes > MAX_CODEX_REQUEST_PRECOMMIT_BYTES {
            return Err(RetryBudgetExhausted::PrecommitBytes);
        }
        Ok(())
    }

    fn next_backoff(&mut self) -> Result<std::time::Duration, RetryBudgetExhausted> {
        let exponent = self.credential_switches.saturating_sub(1).min(4);
        let factor = 1u64 << exponent;
        let base_ms = CODEX_RETRY_BACKOFF_BASE.as_millis() as u64;
        let delay = std::time::Duration::from_millis(base_ms.saturating_mul(factor));
        if self.slept.saturating_add(delay) > MAX_CODEX_RETRY_SLEEP {
            return Err(RetryBudgetExhausted::Sleep);
        }
        if delay > self.remaining()? {
            return Err(RetryBudgetExhausted::Elapsed);
        }
        self.slept = self.slept.saturating_add(delay);
        Ok(delay)
    }
}

pub async fn responses(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    request: Request,
) -> Response {
    let Some(_ingress_permit) = state.try_acquire_ingress() else {
        return overloaded_response();
    };
    let (parts, body) = request.into_parts();
    let headers = parts.headers;
    if let Err(error) = validate_content_length(&headers) {
        return content_length_error_response(error);
    }
    let preauthorized =
        extract_client_key(&headers).map(|key| state.authorize_api_key(key, "chat"));
    let body = match to_bytes(body, MAX_RESPONSE_REQUEST_BODY_BYTES).await {
        Ok(body) => body,
        Err(_) => {
            return json_error(
                StatusCode::PAYLOAD_TOO_LARGE,
                "request body exceeds 16 MiB limit",
            );
        }
    };
    let mut input: serde_json::Value = match serde_json::from_slice::<serde_json::Value>(&body) {
        Ok(value) if value.is_object() => value,
        _ => return json_error(StatusCode::BAD_REQUEST, "invalid JSON request body"),
    };

    let native_model = input
        .get("model")
        .and_then(serde_json::Value::as_str)
        .and_then(|model| state.resolve_native_codex_model(model));
    let Some(native_model) = native_model else {
        return legacy::proxy_request(&state, Method::POST, &uri, headers, body).await;
    };
    let client_headers = match collect_safe_codex_client_headers(&headers) {
        Ok(headers) => headers,
        Err(name) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                &format!("invalid Codex client header: {name}"),
            );
        }
    };
    drop(body);
    if let Some(record) = input.as_object_mut() {
        record.insert(
            "model".to_owned(),
            serde_json::Value::String(native_model.clone()),
        );
    }

    let authorized = match preauthorized {
        Some(Ok(authorized)) => authorized,
        None => return json_error(StatusCode::UNAUTHORIZED, "missing API key"),
        Some(Err(ApiKeyAuthError::Invalid)) => {
            return json_error(StatusCode::UNAUTHORIZED, "invalid API key");
        }
        Some(Err(ApiKeyAuthError::UnsupportedPolicy)) => {
            return json_error(
                StatusCode::FORBIDDEN,
                "API key policy is not supported by the Rust inference core",
            );
        }
        Some(Err(ApiKeyAuthError::EndpointDenied)) => {
            return json_error(
                StatusCode::FORBIDDEN,
                "API key cannot access chat endpoints",
            );
        }
    };

    let request_lifecycle = state.request_lifecycle();
    let previous_response_id = match input.get("previous_response_id") {
        None | Some(serde_json::Value::Null) => None,
        Some(serde_json::Value::String(value))
            if !value.is_empty() && value.len() <= MAX_CONTINUATION_ID_BYTES =>
        {
            Some(value.clone())
        }
        Some(_) => {
            request_lifecycle.finish(RequestOutcome::FailedPrecommit);
            return json_error(
                StatusCode::BAD_REQUEST,
                "previous_response_id must be a non-empty bounded string",
            );
        }
    };
    let continuation_binding = match previous_response_id.as_deref() {
        Some(response_id) => {
            match state.resolve_continuation_affinity(&authorized.principal_scope, response_id) {
                Some(binding) => Some(binding),
                None => {
                    request_lifecycle.finish(RequestOutcome::FailedPrecommit);
                    return json_error(
                        StatusCode::CONFLICT,
                        "previous_response_id is unknown or expired; use stateless replay",
                    );
                }
            }
        }
        None => None,
    };
    let continuation_registration = ContinuationRegistrationContext {
        state: state.clone(),
        caller_scope: authorized.principal_scope.clone(),
    };
    let single_connection_scope =
        continuation_binding.is_some() || authorized.allowed_connections.len() == 1;
    let mut tried_ids = Vec::<String>::new();
    let mut last_error = "no eligible Codex account".to_owned();
    let mut last_failed_account_id = None::<String>;
    let mut last_response_headers = HeaderMap::new();
    let mut retry_budget = RetryBudget::new();

    loop {
        let excluded: Vec<&str> = tried_ids.iter().map(String::as_str).collect();
        let selected = if let Some(binding) = continuation_binding.as_ref() {
            if !tried_ids.is_empty() {
                request_lifecycle.finish(RequestOutcome::FailedPrecommit);
                return apply_safe_response_headers(
                    json_error(
                        StatusCode::BAD_GATEWAY,
                        "Codex continuation attempt failed; request was not replayed",
                    ),
                    &last_response_headers,
                );
            }
            state.select_codex_account_for_binding(
                binding,
                &authorized.allowed_connections,
                Some(&native_model),
            )
        } else {
            state.select_codex_account_for_model(
                &authorized.allowed_connections,
                &excluded,
                Some(&native_model),
            )
        };
        let Some(selected) = selected else {
            if continuation_binding.is_some() {
                request_lifecycle.finish(RequestOutcome::FailedPrecommit);
                return json_error(
                    StatusCode::CONFLICT,
                    "previous_response_id producing auth is unavailable",
                );
            }
            let status = if tried_ids.is_empty() {
                StatusCode::SERVICE_UNAVAILABLE
            } else {
                StatusCode::BAD_GATEWAY
            };
            request_lifecycle.finish(RequestOutcome::FailedPrecommit);
            let response = match last_failed_account_id.as_deref() {
                Some(account_id) => json_error_with_diagnostic(
                    status,
                    &last_error,
                    "codex_retry_exhausted",
                    Some(account_id),
                    &last_error,
                ),
                None => json_error(status, &last_error),
            };
            return apply_safe_response_headers(response, &last_response_headers);
        };

        let account_id = selected.config.id.clone();
        // A key scoped to exactly one connection cannot legally fail over to a
        // different account, so moving the parsed JSON avoids one full request
        // clone. Multi-account/unrestricted keys retain the template for retry.
        let attempt_input = if single_connection_scope && tried_ids.is_empty() {
            input.take()
        } else {
            input.clone()
        };
        let prepared = match CodexAdapter::prepare_with_client_headers(
            uri.path(),
            attempt_input,
            &selected.config,
            &client_headers,
        ) {
            Ok(prepared) => prepared,
            Err(PrepareError::UnsupportedCapabilities(fields)) => {
                request_lifecycle.finish(RequestOutcome::FailedPrecommit);
                let message = format!(
                    "unsupported Codex request capabilities: {}",
                    fields.join(", ")
                );
                return json_error(StatusCode::UNPROCESSABLE_ENTITY, &message);
            }
            Err(_) => {
                request_lifecycle.finish(RequestOutcome::FailedPrecommit);
                return json_error(StatusCode::BAD_REQUEST, "unsupported Codex request");
            }
        };

        match execute_attempt(
            &state,
            prepared,
            selected,
            &native_model,
            &mut retry_budget,
            &request_lifecycle,
            &continuation_registration,
        )
        .await
        {
            AttemptOutcome::Response(response) => return response,
            AttemptOutcome::Retry {
                reason,
                backoff,
                response_headers,
            } => {
                request_lifecycle.note_retry();
                last_failed_account_id = Some(account_id.clone());
                last_error = reason;
                last_response_headers = response_headers;
                if continuation_binding.is_some() {
                    tried_ids.push(account_id);
                    continue;
                }
                request_lifecycle.note_fallback();
                tried_ids.push(account_id);
                if let Err(exhausted) = retry_budget.note_credential_switch() {
                    request_lifecycle.finish(RequestOutcome::FailedPrecommit);
                    return apply_safe_response_headers(
                        retry_budget_response(exhausted),
                        &last_response_headers,
                    );
                }
                if matches!(backoff, RetryBackoff::Transient) {
                    let delay = match retry_budget.next_backoff() {
                        Ok(delay) => delay,
                        Err(exhausted) => {
                            request_lifecycle.finish(RequestOutcome::FailedPrecommit);
                            return apply_safe_response_headers(
                                retry_budget_response(exhausted),
                                &last_response_headers,
                            );
                        }
                    };
                    let mut force_shutdown = state.force_shutdown_receiver();
                    tokio::select! {
                        biased;
                        _ = wait_for_force_shutdown(&mut force_shutdown) => {
                            request_lifecycle.finish(RequestOutcome::CancelledPrecommit);
                            return shutdown_response();
                        }
                        _ = tokio::time::sleep(delay) => {}
                    }
                }
            }
        }
    }
}

fn collect_safe_codex_client_headers(
    headers: &HeaderMap,
) -> Result<BTreeMap<String, String>, String> {
    let mut preserved = BTreeMap::new();

    for name in SAFE_CODEX_CLIENT_HEADER_NAMES {
        let values = headers.get_all(name);
        let mut values = values.iter();
        let Some(value) = values.next() else {
            continue;
        };
        if values.next().is_some() {
            return Err(name.to_owned());
        }
        let value = value.to_str().map_err(|_| name.to_owned())?;
        preserved.insert(name.to_owned(), value.to_owned());
    }

    Ok(preserved)
}

fn safe_upstream_response_headers(headers: &HeaderMap) -> HeaderMap {
    let mut safe = HeaderMap::new();

    for name in SAFE_UPSTREAM_RESPONSE_HEADER_NAMES {
        let mut values = headers.get_all(name).iter();
        let Some(value) = values.next() else {
            continue;
        };
        if values.next().is_some() {
            continue;
        }
        let Ok(value) = value.to_str() else {
            continue;
        };
        let value = value.trim();
        if value.is_empty()
            || value.len() > MAX_SAFE_UPSTREAM_HEADER_BYTES
            || !value.bytes().all(|byte| (b' '..=b'~').contains(&byte))
        {
            continue;
        }
        if let Ok(value) = HeaderValue::from_str(value) {
            safe.insert(HeaderName::from_static(name), value);
        }
    }

    if let Some(retry_after) = parse_retry_after(headers) {
        let seconds = retry_after.min(MAX_PROVIDER_COOLDOWN).as_secs();
        if let Ok(value) = HeaderValue::from_str(&seconds.to_string()) {
            safe.insert(header::RETRY_AFTER, value);
        }
    }

    safe
}

fn apply_safe_response_headers(mut response: Response, headers: &HeaderMap) -> Response {
    for (name, value) in headers {
        response.headers_mut().insert(name.clone(), value.clone());
    }
    response
}

fn extract_response_id_from_sse_event(event: &[u8]) -> Option<String> {
    let raw = std::str::from_utf8(event).ok()?;
    let mut data = String::new();

    for line in raw.lines() {
        let line = line.trim_end_matches('\r');
        let Some(value) = line.strip_prefix("data:") else {
            continue;
        };
        let value = value.strip_prefix(' ').unwrap_or(value);
        if !data.is_empty() {
            data.push('\n');
        }
        data.push_str(value);
    }

    let json = serde_json::from_str::<serde_json::Value>(data.trim()).ok()?;
    let response_id = json
        .get("response")
        .and_then(|response| response.get("id"))
        .and_then(serde_json::Value::as_str)?;

    (!response_id.is_empty() && response_id.len() <= MAX_CONTINUATION_ID_BYTES)
        .then(|| response_id.to_owned())
}

fn extract_client_key(headers: &HeaderMap) -> Option<&str> {
    if let Some(value) = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
    {
        let value = value.trim();
        if let Some(token) = value
            .strip_prefix("Bearer ")
            .or_else(|| value.strip_prefix("bearer "))
        {
            let token = token.trim();
            if !token.is_empty() {
                return Some(token);
            }
        }
    }

    headers
        .get("x-api-key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

struct UpstreamResponseMetadata {
    content_type: HeaderValue,
    safe_headers: HeaderMap,
}

#[derive(Clone)]
struct ContinuationRegistrationContext {
    state: AppState,
    caller_scope: String,
}

enum AttemptOutcome {
    Response(Response),
    Retry {
        reason: String,
        backoff: RetryBackoff,
        response_headers: HeaderMap,
    },
}

async fn execute_attempt(
    state: &AppState,
    prepared: PreparedRequest,
    selected: SelectedCodexAccount,
    model: &str,
    retry_budget: &mut RetryBudget,
    lifecycle: &RequestLifecycleTracker,
    continuation_registration: &ContinuationRegistrationContext,
) -> AttemptOutcome {
    let mut request = state
        .http_client()
        .post(&prepared.url)
        .body(prepared.body.to_string());
    for (name, value) in &prepared.headers {
        request = request.header(name, value);
    }

    let remaining = match retry_budget.begin_send() {
        Ok(remaining) => remaining,
        Err(exhausted) => {
            lifecycle.record_attempt(AttemptLifecycleOutcome::FatalPrecommitFailure);
            lifecycle.finish(RequestOutcome::FailedPrecommit);
            return AttemptOutcome::Response(retry_budget_response(exhausted));
        }
    };
    let mut force_shutdown = state.force_shutdown_receiver();
    let upstream = tokio::select! {
        biased;
        _ = wait_for_force_shutdown(&mut force_shutdown) => {
            lifecycle.record_attempt(AttemptLifecycleOutcome::UpstreamCancelled);
            lifecycle.finish(RequestOutcome::CancelledPrecommit);
            return AttemptOutcome::Response(shutdown_response());
        }
        response = tokio::time::timeout(remaining, request.send()) => match response {
            Err(_) => {
                selected.record_transient_failure();
                lifecycle.record_attempt(AttemptLifecycleOutcome::TimeoutFirstByte);
                lifecycle.finish(RequestOutcome::FailedPrecommit);
                return AttemptOutcome::Response(retry_budget_response(RetryBudgetExhausted::Elapsed));
            }
            Ok(Ok(response)) => response,
            Ok(Err(error)) => {
                if error.is_timeout() || error.is_connect() {
                    selected.record_transient_failure();
                }
                match classify_send_error(&error) {
                    SendFailureClass::SafePreSend => {
                        lifecycle.record_attempt(if error.is_timeout() {
                            AttemptLifecycleOutcome::TimeoutFirstByte
                        } else {
                            AttemptLifecycleOutcome::RetryablePrecommitFailure
                        });
                        return AttemptOutcome::Retry {
                            reason: format!(
                                "Codex upstream connection failed: {}",
                                classify_reqwest_error(&error)
                            ),
                            backoff: RetryBackoff::Transient,
                            response_headers: HeaderMap::new(),
                        };
                    }
                    SendFailureClass::AmbiguousDelivery => {
                        lifecycle.record_attempt(AttemptLifecycleOutcome::FatalPrecommitFailure);
                        lifecycle.finish(RequestOutcome::FailedPrecommit);
                        return AttemptOutcome::Response(json_error(
                            StatusCode::BAD_GATEWAY,
                            "Codex upstream delivery state is ambiguous; request was not replayed",
                        ));
                    }
                }
            }
        }
    };

    let status = upstream.status();
    let retry_after = parse_retry_after(upstream.headers());
    let response_metadata = UpstreamResponseMetadata {
        content_type: upstream
            .headers()
            .get(header::CONTENT_TYPE)
            .cloned()
            .unwrap_or_else(|| HeaderValue::from_static("application/octet-stream")),
        safe_headers: safe_upstream_response_headers(upstream.headers()),
    };

    if !status.is_success() {
        match classify_upstream_status(status) {
            UpstreamFailureClass::Auth => {
                selected.record_auth_rejection();
                lifecycle.record_attempt(AttemptLifecycleOutcome::RetryablePrecommitFailure);
                return AttemptOutcome::Retry {
                    reason: format!(
                        "Codex upstream rejected credentials with HTTP {}",
                        status.as_u16()
                    ),
                    backoff: RetryBackoff::None,
                    response_headers: response_metadata.safe_headers.clone(),
                };
            }
            UpstreamFailureClass::RateLimit => {
                selected.record_rate_limit(Some(model), retry_after);
                lifecycle.record_attempt(AttemptLifecycleOutcome::RetryablePrecommitFailure);
                return AttemptOutcome::Retry {
                    reason: format!("Codex upstream rate limited model {}", model),
                    backoff: RetryBackoff::Transient,
                    response_headers: response_metadata.safe_headers.clone(),
                };
            }
            UpstreamFailureClass::Transient => {
                selected.record_transient_failure();
                lifecycle.record_attempt(AttemptLifecycleOutcome::RetryablePrecommitFailure);
                return AttemptOutcome::Retry {
                    reason: format!("Codex upstream returned transient HTTP {}", status.as_u16()),
                    backoff: RetryBackoff::Transient,
                    response_headers: response_metadata.safe_headers.clone(),
                };
            }
            UpstreamFailureClass::Other => {
                return buffered_upstream_response(
                    state,
                    upstream,
                    status,
                    response_metadata,
                    selected,
                    model,
                    lifecycle,
                )
                .await;
            }
        }
    }

    if prepared.compact {
        return buffered_upstream_response(
            state,
            upstream,
            status,
            response_metadata,
            selected,
            model,
            lifecycle,
        )
        .await;
    }

    let mut upstream_stream = upstream.bytes_stream();
    let mut framer = SseFramer::new(MAX_PRECOMMIT_EVENT_BYTES);
    let mut buffered = Vec::<Bytes>::new();
    let mut buffered_bytes = 0usize;

    loop {
        let remaining = match retry_budget.remaining() {
            Ok(remaining) => remaining,
            Err(exhausted) => {
                lifecycle.record_attempt(AttemptLifecycleOutcome::TimeoutTotal);
                lifecycle.finish(RequestOutcome::FailedPrecommit);
                return AttemptOutcome::Response(retry_budget_response(exhausted));
            }
        };
        let next_item = tokio::select! {
            biased;
            _ = wait_for_force_shutdown(&mut force_shutdown) => {
                lifecycle.record_attempt(AttemptLifecycleOutcome::UpstreamCancelled);
                lifecycle.finish(RequestOutcome::CancelledPrecommit);
                return AttemptOutcome::Response(shutdown_response());
            }
            item = tokio::time::timeout(remaining, upstream_stream.next()) => match item {
                Ok(item) => item,
                Err(_) => {
                    selected.record_transient_failure();
                    lifecycle.record_attempt(AttemptLifecycleOutcome::TimeoutFirstByte);
                    lifecycle.finish(RequestOutcome::FailedPrecommit);
                    return AttemptOutcome::Response(retry_budget_response(RetryBudgetExhausted::Elapsed));
                }
            },
        };
        let Some(item) = next_item else {
            selected.record_transient_failure();
            lifecycle.record_attempt(AttemptLifecycleOutcome::FatalPrecommitFailure);
            lifecycle.finish(RequestOutcome::FailedPrecommit);
            return AttemptOutcome::Response(json_error(
                StatusCode::BAD_GATEWAY,
                "Codex upstream ended before the first event; request was not replayed",
            ));
        };

        let chunk = match item {
            Ok(chunk) => chunk,
            Err(error) => {
                selected.record_transient_failure();
                lifecycle.record_attempt(if error.is_timeout() {
                    AttemptLifecycleOutcome::TimeoutFirstByte
                } else {
                    AttemptLifecycleOutcome::FatalPrecommitFailure
                });
                lifecycle.finish(RequestOutcome::FailedPrecommit);
                return AttemptOutcome::Response(json_error(
                    StatusCode::BAD_GATEWAY,
                    &format!(
                        "Codex upstream failed before stream commit: {}",
                        classify_reqwest_error(&error)
                    ),
                ));
            }
        };

        let mut offset = 0usize;
        while offset < chunk.len() {
            let (frame, consumed) = match framer.push_one(&chunk[offset..]) {
                Ok(result) => result,
                Err(_) => {
                    selected.record_transient_failure();
                    lifecycle.record_attempt(AttemptLifecycleOutcome::FatalPrecommitFailure);
                    lifecycle.finish(RequestOutcome::FailedPrecommit);
                    return AttemptOutcome::Response(json_error(
                        StatusCode::BAD_GATEWAY,
                        "Codex upstream first SSE event exceeded safety limit",
                    ));
                }
            };

            if let Err(exhausted) = retry_budget.observe_precommit_bytes(consumed) {
                selected.record_transient_failure();
                lifecycle.record_attempt(AttemptLifecycleOutcome::FatalPrecommitFailure);
                lifecycle.finish(RequestOutcome::FailedPrecommit);
                return AttemptOutcome::Response(retry_budget_response(exhausted));
            }
            buffered_bytes = buffered_bytes.saturating_add(consumed);
            if buffered_bytes > MAX_PRECOMMIT_BUFFER_BYTES {
                selected.record_transient_failure();
                lifecycle.record_attempt(AttemptLifecycleOutcome::FatalPrecommitFailure);
                lifecycle.finish(RequestOutcome::FailedPrecommit);
                return AttemptOutcome::Response(json_error(
                    StatusCode::BAD_GATEWAY,
                    "Codex upstream did not produce a bounded first SSE event",
                ));
            }
            offset = offset.saturating_add(consumed);

            let Some(frame) = frame else {
                break;
            };
            match classify_precommit_sse_event(&frame) {
                CodexPrecommitClass::Ignore => continue,
                CodexPrecommitClass::RetryableError => {
                    selected.record_transient_failure();
                    lifecycle.record_attempt(AttemptLifecycleOutcome::RetryablePrecommitFailure);
                    return AttemptOutcome::Retry {
                        reason: "Codex upstream returned transient SSE error".to_owned(),
                        backoff: RetryBackoff::Transient,
                        response_headers: response_metadata.safe_headers.clone(),
                    };
                }
                CodexPrecommitClass::Valid => {
                    buffered.push(chunk);
                    let guard = StreamLifecycleGuard::new(
                        lifecycle.clone(),
                        selected,
                        model.to_owned(),
                        continuation_registration.clone(),
                        false,
                    );
                    return AttemptOutcome::Response(streaming_response(
                        buffered,
                        upstream_stream,
                        response_metadata.safe_headers.clone(),
                        force_shutdown,
                        guard,
                    ));
                }
                CodexPrecommitClass::TerminalSuccess => {
                    buffered.push(chunk);
                    let guard = StreamLifecycleGuard::new(
                        lifecycle.clone(),
                        selected,
                        model.to_owned(),
                        continuation_registration.clone(),
                        false,
                    );
                    return AttemptOutcome::Response(streaming_response(
                        buffered,
                        upstream_stream,
                        response_metadata.safe_headers.clone(),
                        force_shutdown,
                        guard,
                    ));
                }
                CodexPrecommitClass::FatalError => {
                    lifecycle.record_attempt(AttemptLifecycleOutcome::FatalPrecommitFailure);
                    lifecycle.finish(RequestOutcome::FailedPrecommit);
                    buffered.push(chunk);
                    let guard = StreamLifecycleGuard::new(
                        lifecycle.clone(),
                        selected,
                        model.to_owned(),
                        continuation_registration.clone(),
                        true,
                    );
                    return AttemptOutcome::Response(streaming_response(
                        buffered,
                        upstream_stream,
                        response_metadata.safe_headers.clone(),
                        force_shutdown,
                        guard,
                    ));
                }
            }
        }

        buffered.push(chunk);
    }
}

fn buffered_response_limit(status: StatusCode) -> (usize, &'static str) {
    if status.is_success() {
        (MAX_CODEX_COMPACT_RESPONSE_BYTES, "64 MiB")
    } else {
        (MAX_CODEX_ERROR_RESPONSE_BYTES, "1 MiB")
    }
}

async fn buffered_upstream_response(
    state: &AppState,
    upstream: reqwest::Response,
    status: StatusCode,
    metadata: UpstreamResponseMetadata,
    selected: SelectedCodexAccount,
    model: &str,
    lifecycle: &RequestLifecycleTracker,
) -> AttemptOutcome {
    let (max_bytes, limit_label) = buffered_response_limit(status);
    let mut force_shutdown = state.force_shutdown_receiver();
    let body = tokio::select! {
        biased;
        _ = wait_for_force_shutdown(&mut force_shutdown) => {
            lifecycle.record_attempt(AttemptLifecycleOutcome::UpstreamCancelled);
            lifecycle.finish(RequestOutcome::CancelledPrecommit);
            return AttemptOutcome::Response(shutdown_response());
        }
        body = read_bounded_response(upstream, max_bytes) => match body {
            Ok(body) => body,
            Err(BoundedResponseError::TooLarge { .. }) => {
                lifecycle.record_attempt(AttemptLifecycleOutcome::FatalPrecommitFailure);
                lifecycle.finish(RequestOutcome::FailedPrecommit);
                drop(selected);
                return AttemptOutcome::Response(json_error(
                    StatusCode::BAD_GATEWAY,
                    &format!(
                        "Codex upstream buffered response exceeds {limit_label} limit"
                    ),
                ));
            }
            Err(BoundedResponseError::Transport(error)) => {
                selected.record_transient_failure();
                lifecycle.record_attempt(if error.is_timeout() {
                    AttemptLifecycleOutcome::TimeoutFirstByte
                } else {
                    AttemptLifecycleOutcome::FatalPrecommitFailure
                });
                lifecycle.finish(RequestOutcome::FailedPrecommit);
                return AttemptOutcome::Response(json_error(
                    StatusCode::BAD_GATEWAY,
                    &format!(
                        "failed reading Codex upstream response: {}",
                        classify_reqwest_error(&error)
                    ),
                ));
            }
        }
    };
    let response = if status.is_success() {
        selected.record_success(Some(model));
        lifecycle.record_attempt(AttemptLifecycleOutcome::SuccessTerminal);
        lifecycle.finish(RequestOutcome::Success);
        Response::builder()
            .status(status)
            .header(header::CONTENT_TYPE, metadata.content_type)
            .header(header::CACHE_CONTROL, "no-store")
            .body(Body::from(body))
            .expect("static buffered response headers are valid")
    } else {
        lifecycle.record_attempt(AttemptLifecycleOutcome::FatalPrecommitFailure);
        lifecycle.finish(RequestOutcome::FailedPrecommit);
        provider_error_response(status, &body, &selected.config.id)
    };
    drop(selected);

    AttemptOutcome::Response(apply_safe_response_headers(
        response,
        &metadata.safe_headers,
    ))
}

struct StreamLifecycleGuard {
    lifecycle: RequestLifecycleTracker,
    selected: SelectedCodexAccount,
    model: String,
    continuation_registration: ContinuationRegistrationContext,
    response_id: Option<String>,
    response_id_conflict: bool,
    observer: SseFramer,
    observer_disabled: bool,
    attempt_finalized: bool,
}

impl StreamLifecycleGuard {
    fn new(
        lifecycle: RequestLifecycleTracker,
        selected: SelectedCodexAccount,
        model: String,
        continuation_registration: ContinuationRegistrationContext,
        attempt_finalized: bool,
    ) -> Self {
        Self {
            lifecycle,
            selected,
            model,
            continuation_registration,
            response_id: None,
            response_id_conflict: false,
            observer: SseFramer::new(MAX_PRECOMMIT_EVENT_BYTES),
            observer_disabled: false,
            attempt_finalized,
        }
    }

    fn observe_chunk(&mut self, chunk: &[u8]) {
        if self.attempt_finalized || self.observer_disabled {
            return;
        }

        let frames = match self.observer.push(chunk) {
            Ok(frames) => frames,
            Err(_) => {
                self.observer_disabled = true;
                return;
            }
        };

        for frame in frames {
            if let Some(response_id) = extract_response_id_from_sse_event(&frame) {
                match self.response_id.as_deref() {
                    None => self.response_id = Some(response_id),
                    Some(existing) if existing == response_id => {}
                    Some(_) => {
                        self.response_id = None;
                        self.response_id_conflict = true;
                    }
                }
            }

            match classify_precommit_sse_event(&frame) {
                CodexPrecommitClass::TerminalSuccess => {
                    self.finish_success();
                    break;
                }
                CodexPrecommitClass::RetryableError => {
                    self.finish_postcommit_failure(true, false);
                    break;
                }
                CodexPrecommitClass::FatalError => {
                    self.finish_postcommit_failure(false, false);
                    break;
                }
                CodexPrecommitClass::Ignore | CodexPrecommitClass::Valid => {}
            }
        }
    }

    fn finish_success(&mut self) {
        if self.attempt_finalized {
            return;
        }
        if !self.response_id_conflict {
            if let Some(response_id) = self.response_id.as_deref() {
                self.continuation_registration
                    .state
                    .register_continuation_affinity(
                        &self.continuation_registration.caller_scope,
                        response_id,
                        &self.selected.config.id,
                        self.selected.config.credential_version,
                    );
            }
        }
        self.selected.record_success(Some(&self.model));
        self.lifecycle
            .record_attempt(AttemptLifecycleOutcome::SuccessTerminal);
        self.lifecycle.finish(RequestOutcome::Success);
        self.attempt_finalized = true;
    }

    fn finish_postcommit_failure(&mut self, penalize_health: bool, timeout: bool) {
        if self.attempt_finalized {
            return;
        }
        if penalize_health {
            self.selected.record_transient_failure();
        }
        self.lifecycle.record_attempt(if timeout {
            AttemptLifecycleOutcome::TimeoutIdle
        } else {
            AttemptLifecycleOutcome::PostcommitFailure
        });
        self.lifecycle.finish(RequestOutcome::FailedPostcommit);
        self.attempt_finalized = true;
    }

    fn finish_incomplete(&mut self) {
        if self.attempt_finalized {
            return;
        }
        if !self.observer_disabled {
            self.selected.record_transient_failure();
        }
        self.lifecycle
            .record_attempt(AttemptLifecycleOutcome::PostcommitFailure);
        self.lifecycle.finish(RequestOutcome::Incomplete);
        self.attempt_finalized = true;
    }

    fn finish_upstream_cancelled(&mut self) {
        if self.attempt_finalized {
            return;
        }
        self.lifecycle
            .record_attempt(AttemptLifecycleOutcome::UpstreamCancelled);
        self.lifecycle.finish(RequestOutcome::Incomplete);
        self.attempt_finalized = true;
    }

    fn finish_downstream_cancelled(&mut self) {
        if self.attempt_finalized {
            return;
        }
        self.lifecycle
            .record_attempt(AttemptLifecycleOutcome::DownstreamCancelled);
        self.lifecycle.finish(RequestOutcome::CancelledPostcommit);
        self.attempt_finalized = true;
    }
}

impl Drop for StreamLifecycleGuard {
    fn drop(&mut self) {
        self.finish_downstream_cancelled();
    }
}

fn streaming_response<S>(
    buffered: Vec<Bytes>,
    upstream: S,
    response_headers: HeaderMap,
    mut force_shutdown: tokio::sync::watch::Receiver<bool>,
    mut guard: StreamLifecycleGuard,
) -> Response
where
    S: futures_util::Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
{
    let body_stream = stream! {
        let upstream = upstream;
        futures_util::pin_mut!(upstream);
        for chunk in buffered {
            guard.observe_chunk(&chunk);
            yield Ok::<Bytes, reqwest::Error>(chunk);
        }
        loop {
            tokio::select! {
                biased;
                _ = wait_for_force_shutdown(&mut force_shutdown) => {
                    guard.finish_upstream_cancelled();
                    eprintln!("[agentproxy-rust] terminating Codex SSE stream after shutdown drain deadline");
                    break;
                }
                item = upstream.next() => match item {
                    Some(Ok(chunk)) => {
                        guard.observe_chunk(&chunk);
                        yield Ok(chunk);
                    }
                    Some(Err(error)) => {
                        guard.finish_postcommit_failure(true, error.is_timeout());
                        yield Err(error);
                        break;
                    }
                    None => {
                        guard.finish_incomplete();
                        break;
                    }
                }
            }
        }
    };

    let response = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/event-stream")
        .header(header::CACHE_CONTROL, "no-cache, no-transform")
        .header("x-accel-buffering", "no")
        .header(header::CONNECTION, "keep-alive")
        .header("access-control-allow-origin", "*")
        .body(Body::from_stream(body_stream))
        .expect("static streaming response headers are valid");
    apply_safe_response_headers(response, &response_headers)
}

fn classify_upstream_status(status: StatusCode) -> UpstreamFailureClass {
    match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => UpstreamFailureClass::Auth,
        StatusCode::TOO_MANY_REQUESTS => UpstreamFailureClass::RateLimit,
        StatusCode::REQUEST_TIMEOUT
        | StatusCode::INTERNAL_SERVER_ERROR
        | StatusCode::BAD_GATEWAY
        | StatusCode::SERVICE_UNAVAILABLE
        | StatusCode::GATEWAY_TIMEOUT => UpstreamFailureClass::Transient,
        _ => UpstreamFailureClass::Other,
    }
}

fn parse_retry_after(headers: &HeaderMap) -> Option<std::time::Duration> {
    let mut values = headers.get_all(header::RETRY_AFTER).iter();
    let value = values.next()?.to_str().ok()?.trim();
    if values.next().is_some() {
        return None;
    }
    if let Ok(seconds) = value.parse::<u64>() {
        return Some(std::time::Duration::from_secs(seconds));
    }

    let deadline = httpdate::parse_http_date(value).ok()?;
    Some(
        deadline
            .duration_since(std::time::SystemTime::now())
            .unwrap_or(std::time::Duration::ZERO),
    )
}

fn classify_send_error(error: &reqwest::Error) -> SendFailureClass {
    // reqwest's connect class covers failures establishing the transport (DNS,
    // TCP connect and TLS handshake). Once an error is no longer connect-class,
    // the request may already have been written upstream, so transparent replay
    // would risk duplicate generation/cost/side effects.
    if error.is_connect() {
        SendFailureClass::SafePreSend
    } else {
        SendFailureClass::AmbiguousDelivery
    }
}

fn retry_budget_response(exhausted: RetryBudgetExhausted) -> Response {
    let (status, message) = match exhausted {
        RetryBudgetExhausted::Elapsed => (
            StatusCode::GATEWAY_TIMEOUT,
            "Codex retry deadline exhausted before a safe upstream response",
        ),
        RetryBudgetExhausted::Sends => (
            StatusCode::BAD_GATEWAY,
            "Codex retry budget exhausted after the maximum upstream sends",
        ),
        RetryBudgetExhausted::CredentialSwitches => (
            StatusCode::BAD_GATEWAY,
            "Codex retry budget exhausted after the maximum credential switches",
        ),
        RetryBudgetExhausted::Sleep => (
            StatusCode::BAD_GATEWAY,
            "Codex retry backoff budget exhausted",
        ),
        RetryBudgetExhausted::PrecommitBytes => (
            StatusCode::BAD_GATEWAY,
            "Codex request-wide precommit byte budget exhausted",
        ),
    };
    json_error(status, message)
}

fn classify_reqwest_error(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "timeout"
    } else if error.is_connect() {
        "connect error"
    } else if error.is_request() {
        "request error"
    } else {
        "stream error"
    }
}

fn validate_content_length(headers: &HeaderMap) -> Result<(), ContentLengthError> {
    let mut values = headers.get_all(header::CONTENT_LENGTH).iter();
    let Some(first) = values.next() else {
        return Ok(());
    };
    if values.next().is_some() {
        return Err(ContentLengthError::Duplicate);
    }
    let declared = first
        .to_str()
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .ok_or(ContentLengthError::Invalid)?;
    if declared > MAX_RESPONSE_REQUEST_BODY_BYTES as u64 {
        return Err(ContentLengthError::TooLarge);
    }
    Ok(())
}

fn content_length_error_response(error: ContentLengthError) -> Response {
    match error {
        ContentLengthError::Duplicate => {
            json_error(StatusCode::BAD_REQUEST, "duplicate Content-Length header")
        }
        ContentLengthError::Invalid => {
            json_error(StatusCode::BAD_REQUEST, "invalid Content-Length header")
        }
        ContentLengthError::TooLarge => json_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "request body exceeds 16 MiB limit",
        ),
    }
}

fn shutdown_response() -> Response {
    json_error(
        StatusCode::SERVICE_UNAVAILABLE,
        "gateway shutdown drain deadline exceeded",
    )
}

fn overloaded_response() -> Response {
    let mut response = json_error(
        StatusCode::SERVICE_UNAVAILABLE,
        "gateway ingress capacity exhausted",
    );
    response
        .headers_mut()
        .insert(header::RETRY_AFTER, HeaderValue::from_static("1"));
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use agentproxy_control_protocol::snapshot::{
        ApiKeyConfig, CodexConnectionConfig, ConfigSnapshot, SUPPORTED_SCHEMA_VERSION,
    };
    use futures_util::stream;
    use sha2::{Digest, Sha256};

    const TEST_KEY: &str = "test-native-key";

    fn native_test_state() -> AppState {
        let state = AppState::new();
        let mut snapshot = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 1);
        snapshot.codex_connections.push(CodexConnectionConfig {
            id: "test-account".to_owned(),
            access_token: "upstream-token".to_owned(),
            workspace_id: None,
            base_url: "https://example.invalid".to_owned(),
            max_concurrent: Some(0),
            credential_version: 1,
        });
        snapshot.api_keys.push(ApiKeyConfig {
            id: "test-key".to_owned(),
            key_hash: format!("{:x}", Sha256::digest(TEST_KEY.as_bytes())),
            allowed_connections: vec!["test-account".to_owned()],
            allowed_endpoints: vec!["chat".to_owned()],
            unsupported_policy: false,
        });
        snapshot.codex_native_models.push("gpt-test".to_owned());
        snapshot.codex_catalog_models.push("gpt-test".to_owned());
        state
            .install_snapshot(snapshot, true)
            .expect("test snapshot should install");
        state
    }

    fn capability_test_state() -> AppState {
        let state = AppState::new();
        let mut snapshot = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 1);
        snapshot.codex_connections.push(CodexConnectionConfig {
            id: "capability-account".to_owned(),
            access_token: "upstream-token".to_owned(),
            workspace_id: None,
            base_url: "https://example.invalid".to_owned(),
            max_concurrent: Some(1),
            credential_version: 1,
        });
        snapshot.api_keys.push(ApiKeyConfig {
            id: "capability-key".to_owned(),
            key_hash: format!("{:x}", Sha256::digest(TEST_KEY.as_bytes())),
            allowed_connections: vec!["capability-account".to_owned()],
            allowed_endpoints: vec!["chat".to_owned()],
            unsupported_policy: false,
        });
        snapshot.codex_native_models.push("gpt-test".to_owned());
        snapshot.codex_catalog_models.push("gpt-test".to_owned());
        state
            .install_snapshot(snapshot, true)
            .expect("capability test snapshot should install");
        state
    }

    fn upstream_test_state(base_url: String) -> AppState {
        let state = AppState::new();
        let mut snapshot = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 1);
        snapshot.codex_connections.push(CodexConnectionConfig {
            id: "runtime-account".to_owned(),
            access_token: "upstream-token".to_owned(),
            workspace_id: None,
            base_url,
            max_concurrent: Some(1),
            credential_version: 1,
        });
        snapshot.api_keys.push(ApiKeyConfig {
            id: "runtime-key".to_owned(),
            key_hash: format!("{:x}", Sha256::digest(TEST_KEY.as_bytes())),
            allowed_connections: vec!["runtime-account".to_owned()],
            allowed_endpoints: vec!["chat".to_owned()],
            unsupported_policy: false,
        });
        snapshot.codex_native_models.push("gpt-test".to_owned());
        snapshot.codex_catalog_models.push("gpt-test".to_owned());
        state
            .install_snapshot(snapshot, true)
            .expect("runtime test snapshot should install");
        state
    }

    fn multi_account_upstream_state(base_url: String, account_count: usize) -> AppState {
        let state = AppState::new();
        let mut snapshot = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 1);
        let mut allowed_connections = Vec::with_capacity(account_count);
        for index in 0..account_count {
            let id = format!("budget-account-{index}");
            allowed_connections.push(id.clone());
            snapshot.codex_connections.push(CodexConnectionConfig {
                id,
                access_token: format!("upstream-token-{index}"),
                workspace_id: None,
                base_url: base_url.clone(),
                max_concurrent: Some(1),
                credential_version: 1,
            });
        }
        snapshot.api_keys.push(ApiKeyConfig {
            id: "budget-key".to_owned(),
            key_hash: format!("{:x}", Sha256::digest(TEST_KEY.as_bytes())),
            allowed_connections,
            allowed_endpoints: vec!["chat".to_owned()],
            unsupported_policy: false,
        });
        snapshot.codex_native_models.push("gpt-test".to_owned());
        snapshot.codex_catalog_models.push("gpt-test".to_owned());
        state
            .install_snapshot(snapshot, true)
            .expect("multi-account test snapshot should install");
        state
    }

    fn spawn_counting_response_server(
        response: &'static [u8],
        max_expected_connections: usize,
    ) -> (
        String,
        std::sync::Arc<std::sync::atomic::AtomicUsize>,
        std::thread::JoinHandle<()>,
    ) {
        use std::io::{ErrorKind, Read, Write};
        use std::net::TcpListener;
        use std::sync::{atomic::Ordering, Arc};
        use std::time::{Duration, Instant};

        let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener should bind");
        listener
            .set_nonblocking(true)
            .expect("listener should become nonblocking");
        let address = listener
            .local_addr()
            .expect("listener address should resolve");
        let count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let server_count = Arc::clone(&count);
        let server = std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(2);
            while Instant::now() < deadline
                && server_count.load(Ordering::SeqCst) < max_expected_connections
            {
                match listener.accept() {
                    Ok((mut socket, _)) => {
                        server_count.fetch_add(1, Ordering::SeqCst);
                        socket
                            .set_read_timeout(Some(Duration::from_secs(1)))
                            .expect("read timeout should configure");
                        let mut scratch = [0u8; 8192];
                        let _ = socket.read(&mut scratch);
                        socket
                            .write_all(response)
                            .expect("loopback response should write");
                    }
                    Err(error) if error.kind() == ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("loopback accept failed: {error}"),
                }
            }
        });
        (format!("http://{address}"), count, server)
    }

    fn spawn_counting_503_server(
        max_expected_connections: usize,
    ) -> (
        String,
        std::sync::Arc<std::sync::atomic::AtomicUsize>,
        std::thread::JoinHandle<()>,
    ) {
        spawn_counting_response_server(
            b"HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
            max_expected_connections,
        )
    }

    fn spawn_single_upstream_response(
        response: &'static [u8],
    ) -> (String, std::thread::JoinHandle<()>) {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::time::Duration;

        let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener should bind");
        let address = listener
            .local_addr()
            .expect("listener address should resolve");
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().expect("loopback request should connect");
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .expect("read timeout should configure");
            let mut scratch = [0u8; 8192];
            let _ = socket.read(&mut scratch);
            socket
                .write_all(response)
                .expect("loopback response should write");
        });
        (format!("http://{address}"), server)
    }

    fn runtime_request() -> Request {
        Request::builder()
            .uri("/v1/responses")
            .header(header::AUTHORIZATION, format!("Bearer {TEST_KEY}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"model":"gpt-test","input":"hello"}"#))
            .expect("runtime test request is valid")
    }

    fn unreadable_body() -> Body {
        Body::from_stream(stream::once(async {
            Err::<Bytes, std::io::Error>(std::io::Error::other("body must not be read"))
        }))
    }

    async fn call_responses(state: AppState, request: Request) -> Response {
        responses(
            State(state),
            OriginalUri("/v1/responses".parse().expect("test URI is valid")),
            request,
        )
        .await
    }

    async fn response_text(response: Response) -> String {
        String::from_utf8_lossy(
            &to_bytes(response.into_body(), 1024 * 1024)
                .await
                .expect("test response body should be bounded"),
        )
        .into_owned()
    }

    #[test]
    fn upstream_status_classification_keeps_auth_quota_and_transient_failures_distinct() {
        assert_eq!(
            classify_upstream_status(StatusCode::UNAUTHORIZED),
            UpstreamFailureClass::Auth
        );
        assert_eq!(
            classify_upstream_status(StatusCode::FORBIDDEN),
            UpstreamFailureClass::Auth
        );
        assert_eq!(
            classify_upstream_status(StatusCode::TOO_MANY_REQUESTS),
            UpstreamFailureClass::RateLimit
        );
        for status in [
            StatusCode::REQUEST_TIMEOUT,
            StatusCode::INTERNAL_SERVER_ERROR,
            StatusCode::BAD_GATEWAY,
            StatusCode::SERVICE_UNAVAILABLE,
            StatusCode::GATEWAY_TIMEOUT,
        ] {
            assert_eq!(
                classify_upstream_status(status),
                UpstreamFailureClass::Transient
            );
        }
        assert_eq!(
            classify_upstream_status(StatusCode::BAD_REQUEST),
            UpstreamFailureClass::Other
        );
    }

    #[test]
    fn retry_budget_caps_sends_switches_elapsed_sleep_and_precommit_bytes() {
        let mut send_budget = RetryBudget::new();
        for _ in 0..MAX_CODEX_UPSTREAM_SENDS {
            assert!(send_budget.begin_send().is_ok());
        }
        assert_eq!(send_budget.begin_send(), Err(RetryBudgetExhausted::Sends));

        let mut switch_budget = RetryBudget::new();
        for _ in 0..MAX_CODEX_CREDENTIAL_SWITCHES {
            assert!(switch_budget.note_credential_switch().is_ok());
        }
        assert_eq!(
            switch_budget.note_credential_switch(),
            Err(RetryBudgetExhausted::CredentialSwitches)
        );

        let mut byte_budget = RetryBudget::new();
        assert!(byte_budget
            .observe_precommit_bytes(MAX_CODEX_REQUEST_PRECOMMIT_BYTES)
            .is_ok());
        assert_eq!(
            byte_budget.observe_precommit_bytes(1),
            Err(RetryBudgetExhausted::PrecommitBytes)
        );

        let mut elapsed_budget = RetryBudget::new();
        elapsed_budget.started = std::time::Instant::now()
            - MAX_CODEX_RETRY_ELAPSED
            - std::time::Duration::from_millis(1);
        assert_eq!(
            elapsed_budget.remaining(),
            Err(RetryBudgetExhausted::Elapsed)
        );

        let mut sleep_budget = RetryBudget::new();
        sleep_budget.credential_switches = 1;
        sleep_budget.slept = MAX_CODEX_RETRY_SLEEP - std::time::Duration::from_millis(50);
        assert_eq!(
            sleep_budget.next_backoff(),
            Err(RetryBudgetExhausted::Sleep)
        );
    }

    #[tokio::test]
    async fn connect_failure_is_safe_presend_but_read_timeout_is_ambiguous() {
        use std::io::Read;
        use std::net::TcpListener;
        use std::time::Duration;

        let closed_listener =
            TcpListener::bind("127.0.0.1:0").expect("loopback listener should bind");
        let closed_address = closed_listener
            .local_addr()
            .expect("listener address should resolve");
        drop(closed_listener);

        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_millis(200))
            .read_timeout(Duration::from_millis(200))
            .build()
            .expect("test client should build");
        let connect_error = client
            .post(format!("http://{closed_address}/v1/responses"))
            .body("{}")
            .send()
            .await
            .expect_err("closed listener should fail before request delivery");
        assert!(connect_error.is_connect());
        assert_eq!(
            classify_send_error(&connect_error),
            SendFailureClass::SafePreSend
        );

        let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener should bind");
        let address = listener
            .local_addr()
            .expect("listener address should resolve");
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().expect("request should connect");
            socket
                .set_read_timeout(Some(Duration::from_secs(1)))
                .expect("read timeout should configure");
            let mut scratch = [0u8; 8192];
            let _ = socket.read(&mut scratch);
            std::thread::sleep(Duration::from_millis(300));
        });

        let timeout_client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_millis(200))
            .read_timeout(Duration::from_millis(50))
            .build()
            .expect("timeout client should build");
        let timeout_error = timeout_client
            .post(format!("http://{address}/v1/responses"))
            .body("{}")
            .send()
            .await
            .expect_err("server stall after reading request should time out");
        server.join().expect("timeout server should finish");
        assert!(timeout_error.is_timeout());
        assert!(!timeout_error.is_connect());
        assert_eq!(
            classify_send_error(&timeout_error),
            SendFailureClass::AmbiguousDelivery
        );
    }

    #[test]
    fn retry_after_parser_accepts_delta_seconds_and_http_date() {
        let mut headers = HeaderMap::new();
        headers.insert(header::RETRY_AFTER, HeaderValue::from_static("42"));
        assert_eq!(
            parse_retry_after(&headers),
            Some(std::time::Duration::from_secs(42))
        );

        let deadline = std::time::SystemTime::now() + std::time::Duration::from_secs(120);
        headers.insert(
            header::RETRY_AFTER,
            HeaderValue::from_str(&httpdate::fmt_http_date(deadline))
                .expect("formatted HTTP date should be a valid header"),
        );
        let remaining = parse_retry_after(&headers).expect("HTTP date should parse");
        assert!(remaining <= std::time::Duration::from_secs(120));
        assert!(remaining >= std::time::Duration::from_secs(118));
    }

    #[tokio::test]
    async fn route_429_records_model_scoped_cooldown() {
        let (base_url, server) = spawn_single_upstream_response(
            b"HTTP/1.1 429 Too Many Requests\r\nContent-Type: application/json\r\nRetry-After: 120\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
        );
        let state = upstream_test_state(base_url);

        let response = call_responses(state.clone(), runtime_request()).await;
        server.join().expect("loopback server should finish");
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        assert!(state
            .select_codex_account_for_model(&[], &[], Some("gpt-test"))
            .is_none());
        assert!(state
            .select_codex_account_for_model(&[], &[], Some("other-model"))
            .is_some());
    }

    #[tokio::test]
    async fn route_503_records_account_wide_transient_cooldown() {
        let (base_url, server) = spawn_single_upstream_response(
            b"HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
        );
        let state = upstream_test_state(base_url);

        let response = call_responses(state.clone(), runtime_request()).await;
        server.join().expect("loopback server should finish");
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        assert!(state
            .select_codex_account_for_model(&[], &[], Some("gpt-test"))
            .is_none());
        assert!(state
            .select_codex_account_for_model(&[], &[], Some("other-model"))
            .is_none());
    }

    #[tokio::test]
    async fn request_wide_retry_budget_caps_physical_sends() {
        use std::sync::atomic::Ordering;

        let (base_url, connection_count, server) = spawn_counting_503_server(5);
        let state = multi_account_upstream_state(base_url, 5);

        let response = call_responses(state, runtime_request()).await;
        server.join().expect("loopback server should finish");

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        assert_eq!(
            connection_count.load(Ordering::SeqCst),
            3,
            "one request must not spray every eligible credential after repeated retryable failures"
        );
    }

    #[tokio::test]
    async fn precommit_eof_is_ambiguous_and_never_replayed() {
        use std::sync::atomic::Ordering;

        let (base_url, connection_count, server) = spawn_counting_response_server(
            b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: 32\r\nConnection: close\r\n\r\n",
            2,
        );
        let state = multi_account_upstream_state(base_url, 2);

        let response = call_responses(state, runtime_request()).await;
        server.join().expect("loopback server should finish");

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        assert_eq!(
            connection_count.load(Ordering::SeqCst),
            1,
            "an ambiguous precommit stream failure must not replay on another credential"
        );
    }

    #[tokio::test]
    async fn coalesced_large_transport_chunk_commits_on_small_first_event() {
        use std::sync::atomic::Ordering;

        let first = b"event: response.created\ndata: {\"type\":\"response.created\"}\n\n";
        let body_len = MAX_PRECOMMIT_BUFFER_BYTES + 64 * 1024;
        let mut raw = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {body_len}\r\nConnection: close\r\n\r\n"
        )
        .into_bytes();
        raw.extend_from_slice(first);
        raw.resize(raw.len() + body_len - first.len(), b'x');
        let raw: &'static [u8] = Box::leak(raw.into_boxed_slice());

        let (base_url, connection_count, server) = spawn_counting_response_server(raw, 1);
        let state = upstream_test_state(base_url);

        let response = call_responses(state.clone(), runtime_request()).await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), body_len + 1024)
            .await
            .expect("postcommit body should stream through");
        assert_eq!(body.len(), body_len);
        assert!(body.starts_with(first));

        server
            .join()
            .expect("coalesced upstream server should finish");
        assert_eq!(connection_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn postcommit_disconnect_is_never_replayed() {
        use std::sync::atomic::Ordering;

        let (base_url, connection_count, server) = spawn_counting_response_server(
            b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: 4096\r\nConnection: close\r\n\r\nevent: response.created\ndata: {\"type\":\"response.created\"}\n\n",
            2,
        );
        let state = multi_account_upstream_state(base_url, 2);

        let response = call_responses(state.clone(), runtime_request()).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert!(
            to_bytes(response.into_body(), 1024 * 1024).await.is_err(),
            "truncated postcommit body should surface to the client instead of being replayed"
        );
        server.join().expect("loopback server should finish");
        assert_eq!(
            connection_count.load(Ordering::SeqCst),
            1,
            "postcommit disconnect must never open a second upstream generation"
        );
    }

    #[tokio::test]
    async fn route_connection_failure_records_account_wide_transient_cooldown() {
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener should bind");
        let address = listener
            .local_addr()
            .expect("listener address should resolve");
        drop(listener);

        let state = upstream_test_state(format!("http://{address}"));
        let response = call_responses(state.clone(), runtime_request()).await;

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        assert!(state
            .select_codex_account_for_model(&[], &[], Some("gpt-test"))
            .is_none());
        assert!(state
            .select_codex_account_for_model(&[], &[], Some("other-model"))
            .is_none());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn caller_cancellation_does_not_penalize_selected_account() {
        use std::net::TcpListener;
        use std::sync::mpsc;
        use std::time::Duration;

        let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener should bind");
        let address = listener
            .local_addr()
            .expect("listener address should resolve");
        let (accepted_tx, accepted_rx) = mpsc::channel();
        let server = std::thread::spawn(move || {
            let (_socket, _) = listener.accept().expect("loopback request should connect");
            accepted_tx
                .send(())
                .expect("test should still be waiting for connection");
            std::thread::sleep(Duration::from_millis(500));
        });
        let state = upstream_test_state(format!("http://{address}"));
        let state_for_request = state.clone();
        let request =
            tokio::spawn(async move { call_responses(state_for_request, runtime_request()).await });

        accepted_rx
            .recv_timeout(Duration::from_secs(3))
            .expect("request should reach loopback upstream");
        request.abort();
        let error = request.await.expect_err("request task should be cancelled");
        assert!(error.is_cancelled());
        server.join().expect("loopback server should finish");

        assert!(state
            .select_codex_account_for_model(&[], &[], Some("gpt-test"))
            .is_some());
    }

    #[test]
    fn content_length_validation_rejects_duplicate_and_oversized_values() {
        let mut duplicate = HeaderMap::new();
        duplicate.append(header::CONTENT_LENGTH, HeaderValue::from_static("12"));
        duplicate.append(header::CONTENT_LENGTH, HeaderValue::from_static("12"));
        assert_eq!(
            validate_content_length(&duplicate),
            Err(ContentLengthError::Duplicate)
        );

        let mut oversized = HeaderMap::new();
        oversized.insert(
            header::CONTENT_LENGTH,
            HeaderValue::from_str(&(MAX_RESPONSE_REQUEST_BODY_BYTES as u64 + 1).to_string())
                .expect("test content length is valid"),
        );
        assert_eq!(
            validate_content_length(&oversized),
            Err(ContentLengthError::TooLarge)
        );
    }

    #[test]
    fn content_length_validation_accepts_missing_and_under_limit_values() {
        assert!(validate_content_length(&HeaderMap::new()).is_ok());
        let mut headers = HeaderMap::new();
        headers.insert(header::CONTENT_LENGTH, HeaderValue::from_static("1024"));
        assert!(validate_content_length(&headers).is_ok());
    }

    #[tokio::test]
    async fn route_rejects_duplicate_content_length_before_polling_body() {
        let mut request = Request::builder()
            .uri("/v1/responses")
            .body(unreadable_body())
            .expect("test request is valid");
        request
            .headers_mut()
            .append(header::CONTENT_LENGTH, HeaderValue::from_static("12"));
        request
            .headers_mut()
            .append(header::CONTENT_LENGTH, HeaderValue::from_static("12"));

        let response = call_responses(AppState::new(), request).await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert!(response_text(response)
            .await
            .contains("duplicate Content-Length"));
    }

    #[tokio::test]
    async fn invalid_key_with_declared_oversized_body_is_rejected_without_polling_body() {
        let request = Request::builder()
            .uri("/v1/responses")
            .header(header::AUTHORIZATION, "Bearer invalid-key")
            .header(
                header::CONTENT_LENGTH,
                (MAX_RESPONSE_REQUEST_BODY_BYTES + 1).to_string(),
            )
            .body(unreadable_body())
            .expect("test request is valid");

        let response = call_responses(native_test_state(), request).await;
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
        assert!(response_text(response).await.contains("16 MiB"));
    }

    #[tokio::test]
    async fn streamed_body_over_limit_returns_stable_413() {
        let chunk = Bytes::from(vec![b'x'; MAX_RESPONSE_REQUEST_BODY_BYTES / 2 + 1]);
        let body = Body::from_stream(stream::iter(vec![
            Ok::<Bytes, std::io::Error>(chunk.clone()),
            Ok::<Bytes, std::io::Error>(chunk),
        ]));
        let request = Request::builder()
            .uri("/v1/responses")
            .body(body)
            .expect("test request is valid");

        let response = call_responses(AppState::new(), request).await;
        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
        assert!(response_text(response).await.contains("16 MiB"));
    }

    #[tokio::test]
    async fn ingress_saturation_returns_bounded_503_without_polling_body() {
        let state = AppState::new();
        let permits: Vec<_> = (0..128)
            .map(|_| state.try_acquire_ingress().expect("permit should exist"))
            .collect();
        let request = Request::builder()
            .uri("/v1/responses")
            .body(unreadable_body())
            .expect("test request is valid");

        let response = call_responses(state, request).await;
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(
            response.headers().get(header::RETRY_AFTER),
            Some(&HeaderValue::from_static("1"))
        );
        drop(permits);
    }

    #[tokio::test]
    async fn unsupported_native_capability_returns_422_before_upstream_dispatch() {
        let request = Request::builder()
            .uri("/v1/responses")
            .header(header::AUTHORIZATION, format!("Bearer {TEST_KEY}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                r#"{"model":"gpt-test","input":"hello","background":true}"#,
            ))
            .expect("test request is valid");

        let response = call_responses(capability_test_state(), request).await;
        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let body = response_text(response).await;
        assert!(body.contains("unsupported Codex request capabilities"));
        assert!(body.contains("background"));
    }

    #[tokio::test]
    async fn under_cap_native_request_preserves_native_auth_contract() {
        let request = Request::builder()
            .uri("/v1/responses")
            .header(header::AUTHORIZATION, format!("Bearer {TEST_KEY}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"model":"gpt-test","input":"hello"}"#))
            .expect("test request is valid");

        let response = call_responses(native_test_state(), request).await;
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert!(response_text(response)
            .await
            .contains("no eligible Codex account"));
    }

    #[tokio::test]
    async fn under_cap_legacy_fallback_is_not_rejected_by_native_auth() {
        let request = Request::builder()
            .uri("/v1/responses")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"model":"legacy-model","input":"hello"}"#))
            .expect("test request is valid");

        let response = call_responses(AppState::new(), request).await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert!(response_text(response)
            .await
            .contains("legacy control-plane proxy is not configured"));
    }

    fn rss_kib(field: &str) -> u64 {
        let status =
            std::fs::read_to_string("/proc/self/status").expect("Linux proc status available");
        status
            .lines()
            .find_map(|line| {
                let rest = line.strip_prefix(field)?;
                rest.split_whitespace().next()?.parse::<u64>().ok()
            })
            .expect("requested RSS field should exist")
    }

    #[tokio::test]
    #[ignore = "resource probe; run explicitly for AP-ISS-0071 evidence"]
    async fn authorized_near_limit_request_reports_peak_rss() {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::time::Duration;

        let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener should bind");
        let address = listener
            .local_addr()
            .expect("listener address should resolve");
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().expect("loopback request should connect");
            socket
                .set_read_timeout(Some(Duration::from_secs(20)))
                .expect("read timeout should configure");
            let mut received = Vec::with_capacity(16 * 1024);
            let mut scratch = [0u8; 64 * 1024];
            let header_end = loop {
                let read = socket
                    .read(&mut scratch)
                    .expect("request read should succeed");
                assert!(read > 0, "connection closed before HTTP headers completed");
                received.extend_from_slice(&scratch[..read]);
                if let Some(index) = received.windows(4).position(|window| window == b"\r\n\r\n") {
                    break index + 4;
                }
                assert!(
                    received.len() < 64 * 1024,
                    "request headers unexpectedly large"
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
                .expect("request should declare Content-Length");
            let mut body_received = received.len().saturating_sub(header_end);
            while body_received < content_length {
                let read = socket
                    .read(&mut scratch)
                    .expect("request body read should succeed");
                assert!(read > 0, "connection closed before request body completed");
                body_received += read;
            }
            socket
                .write_all(
                    b"HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}",
                )
                .expect("loopback response should write");
        });

        let state = AppState::new();
        let mut snapshot = ConfigSnapshot::empty(SUPPORTED_SCHEMA_VERSION, 1);
        snapshot.codex_connections.push(CodexConnectionConfig {
            id: "rss-account".to_owned(),
            access_token: "upstream-token".to_owned(),
            workspace_id: None,
            base_url: format!("http://{address}"),
            max_concurrent: Some(1),
            credential_version: 1,
        });
        snapshot.api_keys.push(ApiKeyConfig {
            id: "rss-key".to_owned(),
            key_hash: format!("{:x}", Sha256::digest(TEST_KEY.as_bytes())),
            allowed_connections: vec!["rss-account".to_owned()],
            allowed_endpoints: vec!["chat".to_owned()],
            unsupported_policy: false,
        });
        snapshot.codex_native_models.push("gpt-test".to_owned());
        snapshot.codex_catalog_models.push("gpt-test".to_owned());
        state
            .install_snapshot(snapshot, true)
            .expect("resource-probe snapshot should install");

        let baseline_hwm = rss_kib("VmHWM:");
        let padding = "x".repeat(MAX_RESPONSE_REQUEST_BODY_BYTES - 1024);
        let payload = format!(r#"{{"model":"gpt-test","input":"{padding}"}}"#);
        assert!(payload.len() <= MAX_RESPONSE_REQUEST_BODY_BYTES);
        let request = Request::builder()
            .uri("/v1/responses")
            .header(header::AUTHORIZATION, format!("Bearer {TEST_KEY}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(payload))
            .expect("resource-probe request is valid");

        let response = call_responses(state, request).await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        server.join().expect("loopback server should finish");
        let peak_hwm = rss_kib("VmHWM:");
        eprintln!(
            "AP-ISS-0071 RSS probe: baseline_hwm_kib={baseline_hwm} peak_hwm_kib={peak_hwm} delta_kib={}",
            peak_hwm.saturating_sub(baseline_hwm)
        );
    }
}
