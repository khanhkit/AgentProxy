# Native Codex Wire Contract v1

AP-ISS-0080 defines the Rust native Codex route as a **normalized compatibility boundary**, not transparent header passthrough.

The executable source of truth is CODEX_NATIVE_WIRE_CONTRACT_VERSION plus the header policy constants in rust/crates/providers/src/codex/adapter.rs. The captured regression manifest is tests/rust-core/fixtures/codex-native-wire-v1.json.

## Contract version

Current contract version: **1**.

Increment the contract version when a change modifies any of these externally relevant wire rules:

- which client headers are preserved;
- which headers are gateway-owned or explicitly forbidden;
- the default Codex client version / beta fingerprint expected when the client does not supply a safe value;
- normalization that changes the native upstream request wire shape.

A Codex CLI/version update must update the captured fixture and tests in the same change. If a newly required client header appears in the fixture but is not represented in the safe-preserve policy, codex_wire_contract_0080 fails instead of silently dropping the header.

## Gateway-owned headers

These headers are owned by AgentProxy and cannot be overridden by the downstream client:

Content-Type, Authorization, Accept, originator, chatgpt-account-id, and session_id.

chatgpt-account-id and session_id are conditional: when present, their values come from the selected account and normalized prompt-cache/session policy. The ownership rule still applies when they are absent.

The client API key is consumed at the AgentProxy ingress. Upstream Authorization is always rebuilt from the selected provider credential.

## Safe client-preserved headers

The v1 allowlist is deliberately closed:

Version, Openai-Beta, X-Codex-Beta-Features, User-Agent, X-Codex-Session-Id, Session-Id, Thread-Id, thread_id, X-Client-Request-Id, X-Codex-Installation-Id, X-Codex-Window-Id, and X-Codex-Turn-Metadata.

Header matching is case-insensitive and output names are canonicalized. A client-provided safe value overrides the gateway's compatibility default for that same safe header. This is the version-negotiation path: a newer supported Codex client can carry its Version, beta feature headers, and user agent without being silently rewritten to the gateway fallback fingerprint.

Preserved client headers are bounded to 8 KiB total, must contain only HTTP-safe printable ASCII / horizontal tab, and duplicate case variants are rejected as ambiguous.

## Forbidden and default-deny headers

The explicit v1 forbidden set covers credential, routing, hop-by-hop, gateway-owned, cookie, and account-bound opaque-state headers:

Authorization, Content-Type, Accept, Host, Content-Length, Connection, Proxy-Authorization, Proxy-Connection, Transfer-Encoding, TE, Upgrade, originator, chatgpt-account-id, session_id, Cookie, Set-Cookie, X-API-Key, and X-Codex-Turn-State.

X-Codex-Turn-State is intentionally not generic passthrough because opaque provider state may require account/provenance binding. It must not be forwarded until the owning affinity/provenance contract explicitly permits it.

All client headers not present in the safe-preserve allowlist are dropped from the native Codex upstream request. The explicit forbidden list documents high-risk classes; the actual forwarding model is allowlist/default-deny.

## Default compatibility fingerprint

When a safe client header is absent, the native adapter retains its documented fallback fingerprint:

- Version: 0.153.2
- Openai-Beta: responses=experimental
- X-Codex-Beta-Features: responses_websockets
- User-Agent: codex-cli/0.153.2 (Windows 10.0.26200; x64)
- originator: codex_cli_rs

This fallback is a compatibility default, not a claim that every request came from that exact client build.

## Supported native Responses subpaths

The Rust native Responses path is an explicit allowlist:

- /responses
- /responses/compact

Equivalent routed prefixes such as /v1/responses resolve to the same two endpoint semantics. Trailing slashes are normalized.

Any other suffix is unsupported by the native adapter and fails closed before execute_attempt, so it cannot inherit base Responses mutations or contact a provider upstream. New provider endpoints require an explicit contract change, endpoint-specific authorization/capability review, and regression coverage before being added to this allowlist.

## Verification

Tests/rust-core/tests/codex_wire_contract_0080.rs verifies the versioned fixture, exact policy sets, gateway-owned override protection, future safe-version preservation, duplicate detection, and bounded values.

Tests/rust-core/tests/codex_wire_gateway_0080.rs verifies the full native gateway path against a loopback upstream: safe client identity/version headers survive, while client auth/account/originator/session overrides and forbidden opaque state do not.

No production credentials or external provider mutation are required for verification.

## Safe upstream response metadata

The native Rust Codex path does not raw-pass provider response headers.

The explicit safe allowlist is limited to provider request/correlation IDs and selected rate-limit metadata:

- x-request-id
- request-id
- openai-request-id
- x-ratelimit-limit-requests
- x-ratelimit-remaining-requests
- x-ratelimit-reset-requests
- x-ratelimit-limit-tokens
- x-ratelimit-remaining-tokens
- x-ratelimit-reset-tokens
- ratelimit-limit
- ratelimit-remaining
- ratelimit-reset
- Retry-After, handled separately

Allowlisted values must be single-valued, printable ASCII, non-empty, and at most 256 bytes. Invalid, duplicate, binary, or oversized values are dropped.

Retry-After accepts valid delta-seconds or HTTP-date input, is normalized to delta seconds, and is clamped to the same 300-second maximum provider cooldown established by AP-ISS-0072. Invalid Retry-After values are ignored.

Headers outside this allowlist are default-deny. In particular, Set-Cookie, authorization/credential headers, arbitrary provider extensions, and provider hop-by-hop Connection values are never forwarded. Gateway-owned response headers remain gateway-owned.
