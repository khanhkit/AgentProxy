# Process Lifecycle Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AgentProxy main Node runtime use one deterministic, bounded lifecycle coordinator while leaf resources expose explicit stop/drain/flush APIs and do not own process exit/signals.

**Architecture:** A process-global hook registry executes six ordered lifecycle phases under one deadline. `gracefulShutdown.ts` composes main-runtime hooks; the active entrypoint alone owns OS signals/final exit. Leaves retain focused resource responsibilities and expose idempotent lifecycle APIs.

**Tech Stack:** TypeScript, Node.js process/timer APIs, Node test runner, Next custom server, SQLite/sql.js.

**Spec:** `docs/superpowers/specs/2026-10-10-process-lifecycle-authority-design.md`

## Global Constraints

- Phase order is exactly: `STOP_ADMISSION → STOP_SCHEDULERS → DRAIN_ACTIVE → FLUSH_DURABLE → CLOSE_RESOURCES → STOP_CHILDREN`.
- `SHUTDOWN_TIMEOUT_MS` is one global shutdown budget, default `30000` ms.
- Main-runtime leaves do not call `process.exit()`, re-send signals, or permanently replace process globals.
- Stop scheduling and draining active work are separate operations.
- DB-writing work drains/flushes before DB close.
- Request hot paths remain non-blocking for webhook/telemetry work.
- Standalone entrypoints keep independent lifecycle ownership.
- Do not broadly rewrite scheduler internals or migrate all timers to JobRegistry.

## Review Focus

- A hook that never resolves must consume only the remaining global deadline, not reset a per-phase timeout.
- A hook rejection must not prevent later durable flush/close hooks from being attempted.
- Shutdown begun while a JobRegistry handler is between handler completion and `recordRun`/`pruneRuns` must wait through terminal DB work.
- A webhook delivery still pending at deadline must be counted observably rather than silently disappearing.
- HMR/repeated adapter lifecycle must not duplicate signal listeners or alter `process.emit` identity.

---

### Task 1: Lifecycle coordinator core

**Files:**
- Create: `src/lib/lifecycle/coordinator.ts`
- Create: `tests/unit/lib/lifecycle/coordinator.test.ts`

**Interfaces:**
- Produces: `LifecyclePhase`, `LifecycleHook`, `registerLifecycleHook(hook): () => void`, `runLifecycleShutdown(options): Promise<LifecycleShutdownReport>`, test reset/introspection helpers.
- Consumes: none.

- [x] Write failing tests for strict phase order, same-phase concurrency, rejection continuation, shared global deadline, and duplicate-name/HMR-safe registration.
- [x] Run the focused coordinator test and verify RED because the module/API does not exist.
- [x] Implement the minimal coordinator with one `globalThis` registry and one deadline.
- [x] Re-run focused tests and verify GREEN.
- [x] Commit coordinator + tests.

### Task 2: Explicit leaf stop/drain contracts

**Files:**
- Modify: `src/lib/jobRegistry/registry.ts`
- Modify: `tests/unit/lib/jobRegistry/registry.test.ts`
- Modify: `open-sse/services/batchProcessor.ts`
- Add/modify focused batch processor unit test under `tests/unit/`
- Modify: `src/lib/services/registry.ts`
- Add: `tests/unit/services/process-lifecycle-registry.test.ts`
- Modify: `open-sse/services/rateLimitManager.ts`
- Modify focused rate-limit tests if present.
- Modify: `src/mitm/manager.ts`
- Modify: `tests/unit/mitm-hosts-cleanup-on-exit.test.ts`

**Interfaces:**
- Produces: `JobRegistry.drain(): Promise<void>`; explicit service-registry `stopAllSupervisors(): Promise<void>`; rate-limit shutdown API that awaits tracked async operations; MITM cleanup callable without signal installation.
- Consumes: none.

- [x] Add RED tests proving JobRegistry stop scheduling does not imply drain, drain waits through terminal `recordRun`/`pruneRuns`, and queued manual work is not admitted after shutdown begins.
- [x] Implement tracked `safeRun()` promises and explicit drain semantics; keep `stopAll()` as scheduling stop.
- [x] Add RED structural/behavior tests proving service registry, rate-limit manager, and MITM library do not install main-runtime SIGINT/SIGTERM handlers.
- [x] Remove leaf signal ownership and expose idempotent stop/drain functions.
- [x] Add/verify batch stop-vs-drain tests using existing `stopBatchProcessor()` + `waitForAllBatches()` primitives.
- [x] Run focused leaf suites and verify GREEN.
- [x] Commit leaf contracts.

### Task 3: Outbound best-effort drain policy

**Files:**
- Modify: `src/lib/webhookDispatcher.ts`
- Modify/add: `tests/unit/webhook-dispatcher-routing.test.ts` or a focused lifecycle webhook test.
- Modify: `open-sse/services/routing/otel.ts`
- Modify: `tests/unit/routing-otel.test.ts`

**Interfaces:**
- Produces: webhook pending-delivery drain API with observable counts; `OtlpHttpsEventSink.stop(): Promise<void>`.
- Consumes: none.

- [x] Add RED webhook tests showing `notifyWebhookEvent()` remains synchronous/non-blocking while pending work is tracked and shutdown drain reports unfinished work.
- [x] Implement pending-promise tracking and bounded drain/report API without request-path awaiting.
- [x] Add RED OTLP test requiring `await sink.stop()` to resolve only after final fetch/flush completes.
- [x] Make OTLP stop awaitable and idempotent.
- [x] Run focused outbound tests and verify GREEN.
- [x] Commit outbound drain policy.

### Task 4: Remove DB adapter process-global ownership

**Files:**
- Modify: `src/lib/db/adapters/nodeSqliteAdapter.ts`
- Modify: `src/lib/db/adapters/sqljsAdapter.ts`
- Modify: `tests/unit/nodesqlite-process-listener-leak-13108.test.ts`
- Add or modify focused sql.js adapter lifecycle test.

**Interfaces:**
- Produces: adapters whose lifecycle is controlled by `close()`/resource owner and whose repeated create/close does not mutate process signals or `process.emit`.
- Consumes: none.

- [x] Replace existing expectation with RED tests asserting open adapters add no SIGINT/SIGTERM listeners and `process.emit` identity never changes.
- [x] Add equivalent sql.js signal-listener invariant test.
- [x] Remove node adapter signal handlers/process.exit and permanent `process.emit` wrapper; retain only local idempotent close/checkpoint behavior.
- [x] Remove sql.js SIGINT/SIGTERM ownership while preserving close-time persistence.
- [x] Run focused DB adapter suites and verify GREEN.
- [x] Commit adapter cleanup.

### Task 5: Main-runtime hook composition and scheduler stop wiring

**Files:**
- Modify: `src/lib/gracefulShutdown.ts`
- Modify: `src/instrumentation-node.ts` only where explicit stop APIs must be paired with startup.
- Modify small scheduler modules only to expose trivial idempotent stop APIs where the main runtime starts a timer but no stop API exists.
- Add: `tests/unit/graceful-shutdown-lifecycle-coordinator.test.ts`

**Interfaces:**
- Consumes: coordinator from Task 1 and leaf APIs from Tasks 2-4.
- Produces: process-singleton lifecycle hook registration and `requestGracefulShutdown(signal)` returning a report/cleanliness result usable by the entrypoint.

- [x] Add RED tests asserting registered hook phase membership and DB close occurs after all DB-writing drain/flush hooks.
- [x] Add RED test that cleanup rejection is recorded while later close hooks still run.
- [x] Register the minimum complete main-runtime stop/drain/flush/close hooks using lazy imports; pair directly-started timer owners with idempotent stop APIs without refactoring their internals.
- [x] Replace monolithic cleanup ordering with coordinator execution and structured logging/reporting.
- [x] Preserve HMR singleton behavior and fallback signal ownership when no custom server owner exists.
- [x] Run focused lifecycle tests and verify GREEN.
- [x] Commit composition/wiring.

### Task 6: Custom server signal owner and global deadline

**Files:**
- Modify: `scripts/dev/run-next.mjs`
- Modify: `tests/unit/run-next-graceful-shutdown-12074.test.ts`
- Modify: `tests/unit/graceful-shutdown-deferred-exit-13306.test.ts`
- Modify: `tests/unit/graceful-shutdown-sighup-8045.test.ts`

**Interfaces:**
- Consumes: `globalThis.__agentproxyRequestShutdown` from Task 5.
- Produces: single custom-server signal/final-exit path with correct admission/drain/child ordering and the shared shutdown timeout.

- [x] Add RED source/behavior tests for first-signal order: stop TCP admission → await app lifecycle → transport cleanup/Next close → Rust child stop → final exit.
- [x] Add RED test that force-exit timeout derives from `SHUTDOWN_TIMEOUT_MS`, not hard-coded 2 seconds, and second signal still exits immediately.
- [x] Implement minimal runner reordering and non-clean lifecycle exit-code propagation.
- [x] Verify fallback SIGTERM/SIGINT/SIGHUP tests and Windows deferred exit behavior remain GREEN.
- [x] Commit entrypoint ownership changes.

### Task 7: Regression, standalone ownership, docs/evidence

**Files:**
- Modify/add focused standalone lifecycle tests only if a regression is exposed.
- Modify: `docs/superpowers/specs/2026-10-10-process-lifecycle-authority-design.md` only for rulings discovered during implementation.
- Add changelog/evidence file if repository policy requires it.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: release-grade verification evidence for AP-ISS-0149.

- [x] Run all focused lifecycle/adapter/job/webhook/OTLP/MITM/rate-limit tests.
- [x] Run `npm run typecheck:core` and applicable open-sse typecheck.
- [x] Run `npm run lint` or scoped lint according to repo quality policy.
- [x] Run the full project test command required by TDD completion policy; record any unrelated pre-existing failures by name.
- [x] Verify standalone MCP/CLI/server signal ownership tests remain explicit and green.
- [x] Review `rg` results for main-runtime `process.on/once(SIG*)`, `process.exit`, `process.kill(process.pid, signal)`, and `process.emit =` to prove only entrypoints own termination/global policy.
- [x] Commit final evidence/docs updates.
