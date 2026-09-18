# Native vs Legacy Responses Route Policy Parity

AP-ISS-0091 defines a maintained policy contract for the hybrid `/v1/responses` boundary. The machine-readable source of truth is `config/quality/native-legacy-route-policy-parity.json`; the unit gate verifies that every required control has both native and legacy ownership, runnable evidence locators, and route/source guards.

## Routing boundary

The Rust gateway parses the request model and selects native Codex handling only when the model resolves through the native Codex catalog. Otherwise it performs the explicit legacy fallback into the Next control plane. Supported compatibility aliases include `/v1/responses`, `/responses`, `/codex`, and `/codex/*`.

A route migration is not complete merely because both sides return a response. The matrix must classify each policy control as **equivalent**, an **intentional difference**, or **delegated** to a different owning layer. New aliases or migrated route behavior must update the manifest and keep its evidence green.

## Required controls

| Control             | Current disposition    | Contract summary                                                                                                                                                                                                                      |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authentication`    | equivalent             | Native-selected requests require Rust API-key authorization; legacy fallback must still reach Next CLIENT_API authentication without a native-auth bypass or premature rejection.                                                     |
| `endpoint_scope`    | equivalent             | Native uses the fixed `chat` endpoint category; legacy aliases must preserve endpoint-allowlist denial across canonical and rewritten forms.                                                                                          |
| `request_body`      | intentional difference | Native Responses is capped at 16 MiB; legacy Next Responses retains the finite 50 MiB LLM API floor. Both are bounded, but the limits are intentionally not identical.                                                                |
| `redirects_headers` | delegated              | Rust owns provider/control-plane transport confinement and legacy hop-by-hop stripping; Next/provider layers own their downstream header contracts. Automatic redirect credential widening is not permitted.                          |
| `errors`            | intentional difference | Native gateway-local errors use the Rust `agentproxy_gateway_error` JSON shape; legacy Next/open-sse preserves protocol-specific Responses/OpenAI envelopes. Both paths must fail closed and sanitize local/internal failure details. |
| `rate_cooldown`     | intentional difference | Native Rust has account/model cooldown plus a request-wide retry amplification budget; legacy Next has API-key rate windows plus provider cooldown-aware retry. Both are bounded but use separate state machines.                     |
| `logging`           | intentional difference | Legacy Next/open-sse persists `call_logs` and `usage_history`; the native Rust Responses path currently does not persist equivalent durable request telemetry. This is an explicit migration gap, not hidden parity.                  |

## Protected invariants

Two invariants remain mandatory across either routing surface even when a policy row is intentionally different:

- **Routing-selector authority:** route/model/account selectors stay authorization objects. Native account selection remains constrained by the authenticated key's `allowed_connections`, while equivalent legacy route forms preserve endpoint-scope denial.
- **Trusted locality:** security-sensitive local/trusted decisions come from trusted peer context, never caller-controlled `Host` or raw `X-Forwarded-For` values.

The manifest pins both invariants to executable regression evidence so future native/legacy migration cannot silently drop them.

## Evidence discipline

The JSON manifest points to concrete test/source locators and exact runner commands. The AP-ISS-0091 gate fails if an evidence file or locator disappears, if one of the seven controls is omitted, if aliases/source seams drift, or if intentional differences stop being documented.

Representative executable evidence includes the Rust ingress admission matrix, Rust secret-transport confinement, authz canonicalization, Next body-size admission, chat cooldown/retry coverage, API-key rate-policy coverage, and persistent request-log sanitization/persistence tests.

## Change rule

When native routing, legacy fallback, a Responses alias, or any of the seven controls changes:

1. update the machine-readable parity row first;
2. classify the relationship as equivalent, intentional difference, or delegated;
3. attach executable evidence for both surfaces;
4. run the parity gate and the referenced focused suites;
5. if a change requires production edits in an actively owned conflict surface, block/re-plan instead of racing another worker.

The matrix records policy parity, not byte-for-byte implementation equality. Intentional differences are acceptable only when explicit, bounded, and covered by executable evidence.
