---
title: "Production Exposure Profile"
---

AgentProxy keeps a **local-first/keyless** compatibility posture for trusted single-user deployments on a trusted network. That posture is not a safe default for an untrusted LAN or the public Internet. Production exposure is an operator decision: bind narrowly, put remotely reachable traffic behind an authenticated TLS perimeter, and explicitly enable the controls below.

## Supported exposure profiles

| Profile | Host publishing | Transport | Authentication posture | Intended network |
| --- | --- | --- | --- | --- |
| Trusted local | `PROD_BIND_HOST=127.0.0.1` | Plain HTTP/WS is acceptable on loopback | Keyless/local-first modes may remain enabled if their global/operator visibility is acceptable | Single trusted host |
| TLS reverse proxy / tunnel | `PROD_BIND_HOST=127.0.0.1` when the proxy is on the same host; otherwise bind only to the private interface reachable by the proxy | Proxy/tunnel terminates TLS; browser-facing traffic is HTTPS/WSS | `REQUIRE_API_KEY=true` for client APIs and dashboard login/OIDC for management access | Remote users through a controlled perimeter |
| External load balancer on a private network | Bind only to the private interface used by the load balancer; `0.0.0.0` is acceptable only when host/network firewall rules prevent direct client reachability | TLS terminates at the load balancer | Same hardened authentication posture as above | Private backend network only |

**Do not expose the compose-published plain HTTP/WS ports directly to the internet.** `docker-compose.prod.yml` therefore publishes dashboard, API, and live WebSocket ports on `127.0.0.1` unless `PROD_BIND_HOST` is explicitly changed.

Container-side `API_HOST=0.0.0.0`, `LIVE_WS_HOST=0.0.0.0`, and `HOSTNAME=0.0.0.0` are Docker-network listener settings. They do not by themselves publish a host port; host exposure is controlled by the compose `ports` mapping and `PROD_BIND_HOST`.

Redis and the browser sidecar in `docker-compose.prod.yml` have no host `ports` mapping and must remain internal unless a separate, authenticated design explicitly requires otherwise.

## Hardened remote checklist

Before allowing remote clients through a reverse proxy, tunnel, or load balancer:

1. Set `REQUIRE_API_KEY=true` for client API routes. Keyless behavior is intentionally supported for trusted local-first use, but keyless/global-operator semantics must not be treated as multi-user isolation.
2. Configure dashboard authentication: replace `INITIAL_PASSWORD=CHANGEME` or use the supported OIDC flow. Set a strong, unique `JWT_SECRET` and `API_KEY_SECRET`.
3. Terminate **TLS** at the trusted reverse proxy/tunnel/load balancer. Set `AUTH_COOKIE_SECURE=true` for HTTPS browser deployments.
4. Set `NEXT_PUBLIC_BASE_URL=https://your.example` (or the higher-priority `AGENTPROXY_PUBLIC_BASE_URL`) to the externally visible origin used for redirects and generated links.
5. Leave `AGENTPROXY_TRUST_PROXY` unset when a configured public base URL is sufficient. Enable it only when direct client access is blocked and the trusted proxy strips/rebuilds forwarded headers. Forwarded headers alone are never caller identity.
6. Keep the internal **peer stamp** contract intact. The custom server authenticates its peer/locality stamp with `AGENTPROXY_PEER_STAMP_TOKEN`; leave that token auto-generated for normal single-process deployments and only pin it when cooperating processes intentionally share the stamp.
7. Set `STORAGE_ENCRYPTION_KEY` to a strong deployment-specific key when persisted provider credentials require encryption at rest. Protect the SQLite volume and backups with the same sensitivity as credentials.
8. Set `AGENTPROXY_ALLOW_LOCAL_PROVIDER_URLS=false` for an untrusted/multi-user deployment unless reaching loopback/LAN provider endpoints is an explicit requirement with a separately controlled egress boundary.
9. Configure finite upstream/reverse-proxy request, connection, and rate limits appropriate to the deployment. Product-specific limits remain additional controls; an external proxy is defence in depth, not a replacement for route authorization.
10. Restrict any non-loopback `PROD_BIND_HOST` with host/network firewall rules so only the intended TLS perimeter can reach the backend ports.

Example hardened values behind a same-host HTTPS reverse proxy:

```dotenv
PROD_BIND_HOST=127.0.0.1
REQUIRE_API_KEY=true
AUTH_COOKIE_SECURE=true
NEXT_PUBLIC_BASE_URL=https://agentproxy.example.com
AGENTPROXY_ALLOW_LOCAL_PROVIDER_URLS=false
JWT_SECRET=<strong-random-secret>
API_KEY_SECRET=<strong-random-secret>
STORAGE_ENCRYPTION_KEY=<strong-random-key>
```

`AGENTPROXY_TRUST_PROXY` is intentionally omitted from this example. Prefer a configured public origin; only opt into forwarded-origin trust when the proxy topology requires it and the peer-stamp/trusted-proxy requirements are satisfied.

## Listener and trust boundaries

- **Dashboard / client API / live WebSocket:** may be remotely reachable only through the hardened TLS/authenticated perimeter described above. The production compose host mapping is loopback by default.
- **LOCAL_ONLY management routes:** locality is security state. A reverse proxy can make the transport peer appear loopback, so authorization must use the authenticated peer stamp / central route policy rather than `Host`, `X-Forwarded-For`, or a proxy-collapsed `remote_addr` as proof of trust.
- **Redis / browser and embedded sidecars:** keep internal to the Docker/private service network unless a separate authenticated protocol explicitly requires exposure.
- **Local provider URLs:** the compatibility mode is useful on trusted developer/homelab systems; disable it for public/multi-user deployments unless the egress target set is intentionally private.

Changing `PROD_BIND_HOST` changes only the host interface used by the production compose port publishing. It does not add TLS or authentication. In particular, `PROD_BIND_HOST=0.0.0.0` is **not** a "public mode" switch.

## Public health endpoint

`GET /healthz` and `HEAD /healthz` are intentionally unauthenticated lifecycle probes. They are safe to expose only because the response is deliberately coarse:

- ready: `200` with `ok`;
- starting: `503` with `starting`;
- stopping: `503` with `stopping`;
- `HEAD` returns the same status and length metadata with no body.

The route must not expose settings, provider/account identities, credentials, secrets, stack traces, database state, or detailed dependency diagnostics. Use authenticated monitoring surfaces for detailed operational data.

## Compatibility notes

This profile does not remove local-first behavior or change the runtime default of `REQUIRE_API_KEY=false`. It makes production exposure explicit and makes the production compose fail closed at the **host publish boundary**. Operators who intentionally need a private non-loopback backend can set `PROD_BIND_HOST` to that interface after applying the TLS/auth/firewall requirements above.
