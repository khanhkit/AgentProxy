---
title: "Native Codex Stream Lifecycle"
---

# Native Codex Stream Lifecycle

AP-ISS-0084 defines the Rust native Codex request lifecycle as two separate scopes: **request outcome** and **attempt outcome**. The gateway must not infer request success from HTTP 200 or the first committed SSE event.

## Request outcomes

The request-level taxonomy is:

- Success
- FailedPrecommit
- FailedPostcommit
- CancelledPrecommit
- CancelledPostcommit
- Incomplete
- RecoveredByRetry
- RecoveredByFallback

A request that eventually succeeds after switching credentials is recorded as RecoveredByFallback rather than hiding the failed attempt. RecoveredByRetry is reserved for safe retry paths that complete without credential fallback.

## Attempt outcomes

The per-attempt taxonomy is:

- SuccessTerminal
- RetryablePrecommitFailure
- FatalPrecommitFailure
- PostcommitFailure
- DownstreamCancelled
- UpstreamCancelled
- TimeoutFirstByte
- TimeoutIdle
- TimeoutTotal

Request and attempt counters are deliberately independent. One request may contain multiple failed attempts and still end as a recovered success.

## Commit versus terminal success

A valid first Codex SSE event commits the downstream HTTP stream and disables transparent replay, but it does **not** mark the provider attempt successful.

Provider/account success is recorded only after a supported terminal-success SSE event such as response.completed, or after a fully buffered successful compact response completes.

If the provider stream ends after commit without a terminal-success event, the request is Incomplete and the attempt is PostcommitFailure. No replay occurs after commit.

## Cancellation and health

Downstream body drop is recorded as:

- request: CancelledPostcommit
- attempt: DownstreamCancelled

Downstream cancellation is observability-only and does not penalize provider/account health.

Gateway-forced shutdown after commit is recorded as UpstreamCancelled with an Incomplete request and also does not penalize provider health.

Provider-side transport failure, timeout, transient semantic failure, or an EOF without terminal success may affect transient account health. Fatal application-level semantic errors are recorded as failures but are not automatically treated as credential/transient-health failures.

## Stream finalization

The streaming body owns a drop-aware lifecycle guard. It finalizes exactly once on one of:

- observed terminal success;
- postcommit provider error;
- postcommit transport error or timeout;
- provider EOF without terminal success;
- forced gateway shutdown;
- downstream body drop.

The guard observes SSE semantics before yielding each chunk downstream. Therefore a terminal event is recorded even if the downstream disconnects immediately after receiving that terminal chunk.

The observer itself is bounded. If local lifecycle parsing loses visibility because an event exceeds its observation bound, the request may be classified Incomplete, but that local observability limitation alone must not penalize provider health.

## Verification

Focused coverage lives in:

- rust/crates/gateway/src/lifecycle.rs unit tests;
- tests/rust-core/tests/codex_lifecycle_stream_0084.rs.

The integration suite uses only loopback upstreams and covers terminal success, fatal precommit failure, postcommit provider failure, incomplete EOF, downstream cancellation, forced shutdown, and retry-to-fallback recovery.
