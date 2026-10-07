---
title: "Inference Auth Posture"
---

# Inference Auth Posture

## Overview

`GET /v1/models` and the inference endpoints are gated by **different
settings**. The most natural probe an operator runs to answer "is my API
protected?" can therefore return the wrong answer.

| Endpoint                                                                           | Gated by                                                                                                                                           |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/models`                                                                   | The dashboard login posture — `isAuthRequired()`, overridable per-instance with `requireAuthForModels` (`src/app/api/v1/models/catalogRequest.ts`) |
| `POST /v1/chat/completions`, `POST /v1/responses`, and the other client API routes | `REQUIRE_API_KEY` (`src/server/authz/policies/clientApi.ts`)                                                                                       |

On an instance that has an admin password set and `REQUIRE_API_KEY=false`,
`/v1/models` answers `401` while inference is open to anyone who can reach the
port.

> **Probing caveat:** a `401` from `/v1/models` does **not** verify that
> inference is protected. It only tells you the dashboard requires login.

This is not hypothetical. A deployment can therefore return `401` from `/v1/models` while still accepting anonymous inference traffic on `/v1/responses` or `/v1/chat/completions`.

## How to actually check

Probe an inference route, not the catalog:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://<host>:<api-port>/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"<any-model>","messages":[{"role":"user","content":"ping"}]}'
```

A `401` means `REQUIRE_API_KEY` is enforcing. Anything that reaches routing
(including a model-not-found error) means anonymous traffic is accepted.

Note that with `REQUIRE_API_KEY=false` an **invalid** bearer degrades to
anonymous rather than rejecting (#2257), so sending a junk key is not a valid
probe either.

## Startup warning

When `REQUIRE_API_KEY` is disabled and a server binds a non-loopback interface,
AgentProxy logs a warning at boot (`src/lib/startup/nonLoopbackApiKeyGuard.ts`) for the Dashboard/API server that serves `/v1` inference. `scripts/dev/run-next.mjs` publishes the actual `HOST` bind through the internal `AGENTPROXY_BOUND_HOST` compatibility signal; the standalone container path follows Next's `HOSTNAME`.

The warning never blocks boot: a trusted reverse proxy in front of AgentProxy may already enforce authentication.

## Related

- `REQUIRE_API_KEY` in [ENVIRONMENT.md](../reference/ENVIRONMENT.md)
- `APP_BIND_HOST` and the compose loopback defaults
- Invalid bearer handling when `REQUIRE_API_KEY` is off
