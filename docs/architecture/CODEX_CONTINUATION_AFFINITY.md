# Native Codex Continuation Affinity

AP-ISS-0106 defines a narrow producing-auth affinity contract for provider-owned Codex continuation references.

## Scope

Affinity applies only when a native Codex request carries a non-empty bounded `previous_response_id`.

By-value continuation state such as `reasoning.encrypted_content` and compacted input items does **not** create account stickiness by itself.

## Principal scope

Affinity is isolated by the authenticated API-key fingerprint used for authorization, not by a display/name field.

The stored key is effectively:

`authenticated principal fingerprint + SHA-256(previous_response_id)`

The raw opaque response ID is not stored as a map key and is never written to diagnostics/logs.

## Binding value

Each mapping binds to:

- Codex connection/account ID
- credential_version

A credential-version change invalidates the old binding even when the logical connection ID remains the same.

## Lifetime and capacity

The in-memory map is bounded to 4096 entries with a 30-minute TTL.

Expired entries are pruned on read/write. When capacity is reached, the oldest surviving entry is evicted.

Mappings are intentionally process-local. Restart persistence is outside this issue.

## Request routing

For requests without `previous_response_id`, ordinary multi-account selection remains unchanged.

For requests with `previous_response_id`:

1. resolve caller-scoped affinity before generic account selection;
2. unknown, expired, evicted, or cross-principal IDs return HTTP 409 before upstream dispatch;
3. a known binding selects only the producing account with the same credential version;
4. if that bound auth is unavailable or no longer permitted for the caller, return HTTP 409;
5. if the bound attempt produces a retryable failure, do not switch credentials and do not replay the provider-owned reference through another account.

Clients that cannot resolve a prior provider-owned reference must use stateless by-value replay instead of silent rebinding.

## Registration boundary

A response ID is captured only from the SSE `response.id` field.

The stream lifecycle guard may observe an ID on `response.created`, but it does not register affinity at commit time.

Registration occurs only when the same winning stream reaches terminal success. Failed, retrying, losing, incomplete, cancelled, shutdown, and other non-terminal-success attempts do not create mappings.

If different response IDs are observed within one stream, the ID is treated as ambiguous and no affinity mapping is registered.

## Compact responses

`/responses/compact` is treated as by-value compaction state according to the AP-ISS-0089 investigation. A compact response does not create blanket affinity.

If a compact request itself carries `previous_response_id`, the same pre-dispatch affinity-resolution rule still applies because routing occurs before adapter path dispatch.

## Security properties

- no raw continuation IDs in logs;
- caller isolation uses a uniqueness-enforced authenticated key fingerprint;
- unknown IDs never become stable aliases;
- provider-owned state is never silently rebound to a different auth;
- storage is bounded by TTL and capacity;
- ordinary stateless routing remains available when no provider-owned reference is present.
