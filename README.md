# AgentProxy

**AgentProxy** is an independent, self-hosted AI gateway built for coding agents and multi-agent systems.
It combines a high-performance **Rust inference data plane** with an extensible **TypeScript/Next.js control plane**.

AgentProxy was seeded from an earlier MIT-licensed gateway codebase and is now maintained as an independent repository and product. The inherited copyright and license attribution is preserved in LICENSE, dependency notices remain in THIRD_PARTY_NOTICES.md, and repository history preserves implementation provenance.

## Why AgentProxy

The immediate goal is a low-latency, resilient gateway for Codex and other agent traffic:

- Rust/Tokio multi-core streaming data plane
- first-valid-event SSE commitment (no semantic output-text buffering)
- pre-commit account failover without leaking failed upstream events
- in-memory account leases, health-aware routing, and concurrency limits
- hash-only client API-key admission in the Rust hot path
- config/credential snapshots from the local control plane with restart-safe generations
- HTTP and WebSocket compatibility fallback to the inherited 358-provider control-plane catalog while providers migrate to Rust
- native Codex Responses fast path with connection pooling and inactivity-based stream timeouts

## Architecture

```text
                         public API :20128
                               |
                       +-------v--------+
                       | AgentProxy Rust |
                       |   data plane    |
                       +---+---------+---+
                           |         |
             native routes|         |legacy HTTP / WS
                           |         v
                           |   Next control plane :20129
                           |        |
                           |    SQLite / OAuth / UI
                           v
                      upstream LLMs
```

Normal native inference does **not** pass through Node.js. The control plane publishes versioned local snapshots; Rust owns live routing, streaming, account leases, and native provider transports.

## Production start

```bash
npm install
npm run start:rust-core
```

Default topology in Rust-core mode:

- API / Rust gateway: `http://127.0.0.1:20128`
- Dashboard / control plane: `http://127.0.0.1:20129`

Canonical environment variables use the AGENTPROXY_ prefix. Green Release removes former product-prefixed runtime aliases; operators should use the AgentProxy names documented in docs/reference/ENVIRONMENT.md.

## Verification

```bash
npm run typecheck:core
npm run rust-core:verify
npm run rust-core:build
```

The Rust verification suite covers stream commitment, SSE framing, API-key admission, account leases, snapshot restart/hot-reload behavior, native Codex streaming/fallback, legacy HTTP proxying, and WebSocket bridging.

## Roadmap

AgentProxy is intentionally broader than a model proxy. Planned first-class subsystems include:

1. **Rust routing/provider core** — migrate more native provider transports and translators.
2. **MCPHub integration** — per-user tool registries, permissions, gateways, and remote MCP connectivity.
3. **Memory** — durable user/agent memory with scoped retrieval and provenance.
4. **RAG** — ingestion, chunking, embeddings, reranking, and agent-facing retrieval APIs.
5. **Knowledge Hub** — unified documents, repositories, web sources, MCP resources, and graph/semantic indexes.
6. **Agent orchestration / A2A** — resumable workers, routing, events, schedules, and cross-session collaboration.

The architecture keeps these control/knowledge services out of latency-sensitive token forwarding unless a request explicitly invokes them.

## Lineage and attribution

AgentProxy preserves the inherited MIT copyright and license terms while developing new work independently in this repository. Earlier implementation provenance remains available in Git history; current architecture and release documentation use AgentProxy identity exclusively.

## Status

`v0.1.0` focuses on productionizing the Rust data plane while preserving the inherited control-plane compatibility surface. Provider migration is incremental: native Rust paths are used only where routing eligibility is explicit; all other compatible API traffic falls back to the control plane rather than being guessed or misrouted.
