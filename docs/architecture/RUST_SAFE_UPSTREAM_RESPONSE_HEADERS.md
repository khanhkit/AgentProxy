# Rust Safe Upstream Response Headers

AP-ISS-0088 defines the metadata that the Rust native Codex path may copy from an upstream provider response to the downstream client.

The policy is an explicit allowlist. Any provider response header not listed below is dropped.

## Safe request and trace identifiers

The following bounded single-value identifiers may be preserved:

- x-request-id
- request-id
- openai-request-id
- x-openai-request-id
- x-correlation-id
- traceparent
- traceresponse

These values are diagnostic metadata only. They do not grant authorization and are never used to select an account or provider.

## Safe rate-limit metadata

The following bounded single-value rate-limit fields may be preserved:

- x-ratelimit-limit
- x-ratelimit-remaining
- x-ratelimit-reset
- x-ratelimit-limit-requests
- x-ratelimit-remaining-requests
- x-ratelimit-reset-requests
- x-ratelimit-limit-tokens
- x-ratelimit-remaining-tokens
- x-ratelimit-reset-tokens
- ratelimit-limit
- ratelimit-remaining
- ratelimit-reset

Each preserved ordinary header value must be non-empty printable ASCII, have exactly one upstream value, and be at most 256 bytes. Duplicate, oversized, binary, or control-character values are ignored.

## Retry-After

Retry-After is handled separately from ordinary passthrough.

The gateway accepts exactly one valid upstream Retry-After expressed as delta seconds or HTTP-date. It normalizes the downstream value to integer delta seconds and clamps the result to the account-health provider cooldown ceiling from AP-ISS-0072, currently 300 seconds.

Malformed or duplicate Retry-After values are ignored.

This normalization applies to retry-exhaustion responses as well as direct safe response metadata so clients receive a bounded recovery hint without trusting an arbitrary provider delay.

## Headers that are never copied

The allowlist model means all other headers are dropped, including:

- Authorization and proxy credentials
- X-API-Key or provider-specific secret headers
- Cookie and Set-Cookie
- Connection and other hop-by-hop fields
- Host, Content-Length, Transfer-Encoding, Upgrade
- arbitrary provider extension/debug headers

Gateway-owned response headers such as Content-Type, Cache-Control, Connection, CORS, and error-correlation fields continue to be synthesized by AgentProxy and cannot be overridden by the upstream allowlist.

## Paths covered

The same safe metadata policy is applied to:

- native streaming Responses success;
- buffered native compact success;
- buffered non-retryable provider errors after public-body sanitization;
- final retry/fallback exhaustion using the most recent upstream response metadata.

## Verification

Focused regression coverage is in tests/rust-core/tests/codex_response_headers_0088.rs.

The suite proves:

- safe request/rate-limit metadata survives streaming responses;
- safe metadata survives sanitized buffered provider errors;
- secret, cookie, custom, and provider Connection headers do not pass through;
- huge Retry-After is normalized and clamped to 300 seconds;
- malformed and duplicate Retry-After values are ignored;
- duplicate or oversized otherwise-safe metadata is ignored.
