# Rust Public Error Boundary

AP-ISS-0085 defines the Rust native Codex public-error contract.

## Public response contract

Public JSON errors expose only:

- top-level error
- top-level error_id
- error.message
- error.type
- optional error.code
- optional error.param

No internal account identifier, provider extension field, credential-like field, raw provider object, provider debug object, or secret-bearing opaque extension is forwarded.

Provider JSON is therefore handled as an allowlist, not a denylist.

Non-JSON provider bodies are replaced with a generic bounded upstream-provider error.

## Bounds and normalization

Public message values are limited to 512 UTF-8 bytes.

Public type, code, and param values are limited to 128 UTF-8 bytes each.

Control characters are normalized before JSON serialization so escaped output cannot expand an otherwise character-bounded field beyond the intended byte budget.

All error responses use application/json and Cache-Control: no-store.

## Correlation IDs

Every Rust native public JSON error receives an opaque error_id with an apx- prefix.

The public identifier does not contain account IDs, provider IDs, URLs, credentials, token hashes, or upstream bodies.

The same error_id is written into the corresponding private structured diagnostic when private provider/account context is available.

## Private diagnostics

Internal account IDs are allowed only in the server-side structured diagnostic record.

The private record includes:

- event name
- error_id
- diagnostic context
- internal account ID when applicable
- bounded operational detail such as HTTP status, provider-body byte count, or normalized retry reason

Raw provider bodies are intentionally not copied into the diagnostic log. This preserves correlation without turning the log sink into a second secret-leak boundary.

## Retry exhaustion

Retry/fallback failure reasons exposed publicly are normalized reason classes such as credential rejection, transient HTTP status, rate limit, or transport category.

The selected internal account ID is kept only in the correlated private diagnostic.

## Verification

Focused regression coverage lives in tests/rust-core/tests/codex_error_boundary_0085.rs and unit coverage in rust/crates/gateway/src/error_boundary.rs.

The integration tests prove:

- exhausted retry bodies contain no internal account IDs and include error_id;
- provider secret-canary extension fields and provider account IDs are absent;
- the returned provider JSON shape is exactly allowlisted;
- non-JSON provider bodies are replaced rather than reflected;
- public bodies remain bounded.
