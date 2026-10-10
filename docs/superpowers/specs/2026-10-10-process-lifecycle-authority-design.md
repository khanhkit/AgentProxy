# AP-ISS-0149 Process Lifecycle Authority Design

## Status

Approved for AUTOPILOT execution on 2026-10-10. The user explicitly authorized the worker to make implementation decisions autonomously provided those decisions are documented. This document is the binding architecture record for AP-ISS-0149.

## Problem

The main Node runtime currently has multiple process-global lifecycle owners. Signal handlers exist in the application shutdown module, service registry, SQLite adapters, rate-limit manager, and MITM manager. Background owners also mix "stop scheduling" with "drain active work", while webhooks and OTLP telemetry can disappear as invisible fire-and-forget work. The custom Next runner additionally stops the Rust child and force-closes sockets before application drain/flush.

The result is import-order-dependent behavior, DB-close races, unbounded or invisible loss, and multiple ways to terminate the process.

## Decision

Introduce one process-global **application lifecycle coordinator** for the main runtime. The coordinator owns ordered shutdown hooks and one global deadline. It does **not** own `process.exit()` directly; final exit remains owned by the active main-server entrypoint:

- `scripts/dev/run-next.mjs` is the sole OS-signal/final-exit owner when the custom Next server is used.
- `src/lib/gracefulShutdown.ts` installs the fallback signal/final-exit owner only when no custom server owner has been declared.
- Standalone MCP/CLI/server entrypoints keep independent lifecycle ownership because they are separate processes.

Leaf modules expose idempotent stop/drain/flush/dispose functions and never call `process.exit()`, re-send a signal, or permanently monkey-patch process globals.

## Ordered phases

The coordinator executes these phases strictly in order:

1. `STOP_ADMISSION`
2. `STOP_SCHEDULERS`
3. `DRAIN_ACTIVE`
4. `FLUSH_DURABLE`
5. `CLOSE_RESOURCES`
6. `STOP_CHILDREN`

`EXIT` is intentionally outside the coordinator and belongs to the entrypoint.

Hooks inside a phase may run concurrently because ordering between independent resources in one phase is not semantically required. Phases never overlap.

## Global deadline

`SHUTDOWN_TIMEOUT_MS` remains the single configured shutdown budget, defaulting to 30 seconds. The coordinator computes one deadline at shutdown start. Every hook receives the same remaining budget indirectly through coordinator timeout enforcement; phases do not each get a fresh timeout.

A timed-out or rejected hook is recorded as a failure. The coordinator continues later hooks while budget remains so one broken cleanup does not prevent durable flush/close attempts. A timeout never becomes a fake clean shutdown.

The custom Next runner uses the same configured shutdown budget for its force-exit safety timer rather than a separate 2-second policy.

## Hook model

Create `src/lib/lifecycle/coordinator.ts` with:

- `LifecyclePhase` string union for the six phases.
- `LifecycleHook` with stable `name`, `phase`, and `run(): void | Promise<void>`.
- `registerLifecycleHook(hook): () => void` for idempotent process-global registration by `name`.
- `runLifecycleShutdown(options): Promise<LifecycleShutdownReport>` for deterministic ordered execution.
- report entries containing hook name, phase, status (`ok | rejected | timed_out | skipped_deadline`), and optional error text.
- test-only reset/introspection helpers isolated behind `__*ForTests` exports.

Registration is a process-global singleton stored on `globalThis` so HMR/module duplication does not duplicate hooks.

## Main-runtime hook ownership

`src/lib/gracefulShutdown.ts` becomes the composition root for shutdown execution. `initGracefulShutdown()` registers main-runtime lifecycle hooks once and publishes `globalThis.__agentproxyRequestShutdown`.

The composition root uses lazy imports inside hook bodies so shutdown support does not add request-path overhead and optional features remain optional.

Minimum hook mapping for AP-ISS-0149:

| Phase | Resource | Required behavior |
| --- | --- | --- |
| STOP_ADMISSION | request lifecycle | `markServerStopping()`; no new application work admitted |
| STOP_SCHEDULERS | JobRegistry | clear all timers only |
| STOP_SCHEDULERS | batch processor | stop polling only |
| STOP_SCHEDULERS | known main-runtime timers/watchers | call existing idempotent stop APIs; add trivial stop exports where a main-runtime timer lacks one |
| DRAIN_ACTIVE | request lifecycle | await tracked active requests |
| DRAIN_ACTIVE | JobRegistry | await all in-flight handler promises including terminal `recordRun` + `pruneRuns` |
| DRAIN_ACTIVE | batch processor | await `activeProcesses` |
| DRAIN_ACTIVE | services registry | await supervisor `stop()` because it persists terminal DB status |
| DRAIN_ACTIVE | rate-limit manager | stop watchdog/limiters and await tracked async limiter work |
| DRAIN_ACTIVE | MITM library | run explicit async exit cleanup; no library-level signal listeners |
| FLUSH_DURABLE | spend batch writer | stop/flush pending writes |
| FLUSH_DURABLE | call logs / audit / telemetry | bounded durable/best-effort flush per policy |
| FLUSH_DURABLE | webhooks | bounded wait for pending deliveries; report dropped count if deadline wins |
| FLUSH_DURABLE | OTLP sink | `stop()` becomes awaitable and flushes before resolving |
| CLOSE_RESOURCES | DB/files/loggers | close audit DB, core DB, logger/file resources after all DB writers drained |
| STOP_CHILDREN | VNC / ChatGPT Web runtime and custom runner Rust child | child teardown after DB-persisting services complete |

The coordinator must not convert unrelated timers to JobRegistry. Adding a stop export or registering an existing stop function is sufficient.

## Stop scheduling vs drain

### JobRegistry

`stopAll()` continues to mean "stop scheduling" for compatibility. Add `drain(): Promise<void>` (or an equivalently explicit name) that waits for every `safeRun()` promise. `safeRun()` promises are tracked from scheduled and manual paths. The promise remains tracked through `recordRun()` and `pruneRuns()`, so DB terminal state is complete before drain resolves.

Queued `runNow()` follow-ups are not admitted after stop scheduling begins. They resolve with a shutdown reason instead of creating new work.

### Batch processor

Keep `stopBatchProcessor()` and `waitForAllBatches()` separate, but the lifecycle hooks call them in different phases.

## Best-effort outbound policy

### Webhooks

`notifyWebhookEvent()` remains non-blocking on the request hot path. It tracks the returned delivery promise in a process-global pending set. Shutdown exposes a bounded drain API returning observable counts (`completed`, `pending/dropped`). No request waits for a webhook.

### OTLP

`OtlpHttpsEventSink.stop()` becomes `async` and waits for the final flush. Existing callers that do not care may `void sink.stop()`. Shutdown awaits it where the active sink is process-owned.

## DB adapters and process globals

- `nodeSqliteAdapter` removes SIGINT/SIGTERM listeners and never calls `process.exit()`.
- `sqljsAdapter` removes SIGINT/SIGTERM listeners; adapter close/persist is invoked by resource ownership rather than process-global hooks.
- `beforeExit` may remain only if it is local, idempotent, removed on close, and does not terminate the process. Main shutdown correctness must not depend on it.
- `nodeSqliteAdapter` removes the permanent `process.emit` replacement entirely. Experimental warning suppression, if ever desired, belongs to bootstrap configuration outside an adapter.

Repeated adapter create/close must leave process listener counts and `process.emit` identity unchanged.

## Main custom-server ordering

`scripts/dev/run-next.mjs` remains the sole signal/final-exit owner for the custom server.

On first signal:

1. mark shutdown in progress and arm one force-exit timer using `SHUTDOWN_TIMEOUT_MS`;
2. call `server.close()` to stop new TCP admissions, but do not immediately `closeAllConnections()`;
3. await application lifecycle (`__agentproxyRequestShutdown`), which drains tracked requests and flushes/ closes application resources;
4. close remaining idle/all HTTP connections as a final transport cleanup if needed;
5. close Next;
6. stop the Rust child;
7. clear timer and `process.exit(exitCode)`.

A second signal remains an explicit immediate forced exit.

## Failure semantics

- Hook rejection is captured in the shutdown report and logged with phase/name.
- Later hooks continue when possible.
- Any rejection or timeout makes the application shutdown result non-clean so the entrypoint exits non-zero unless it already has a non-zero code.
- Signal handlers never throw.
- Deadline exhaustion marks remaining hooks `skipped_deadline` and proceeds to entrypoint termination.

## Testing strategy

Focused tests must cover:

- coordinator phase order, per-phase parallelism, rejection continuation, one global deadline, and HMR-safe singleton registration;
- SIGTERM/SIGINT/SIGHUP ownership with and without the custom server owner;
- custom runner ordering and second-signal force exit;
- JobRegistry stop-scheduling vs drain and DB terminal-record completion;
- batch stop vs active-process drain;
- webhook pending-delivery drain/drop accounting;
- OTLP awaitable final flush;
- Node/sql.js adapter listener/global-wrapper invariants across repeated create/close;
- service registry and rate-limit/MITM leaves having no process signal ownership;
- standalone MCP/CLI/server lifecycle tests remaining green.

## Non-goals

- No migration of every timer to JobRegistry.
- No redesign of scheduler algorithms.
- No changes to unrelated Phase-24 hardening issues.
- No request hot-path waiting or added network round trips.

## Implementation rulings (AUTOPILOT)

These rulings were made during TDD implementation and are part of the design record:

- Adapter `beforeExit` hooks remain permitted only as removable, idempotent local persistence safety nets. Node/sql.js adapters do not own SIGINT/SIGTERM and never replace `process.emit`.
- Provider-limits and runtime-config hot reload expose separate **stop scheduling** and **drain active work** APIs because both can touch durable DB state.
- Model sync had a hidden startup timer that the previous stop API could not cancel. Shutdown now owns that startup timer and tracks the active cycle so STOP_SCHEDULERS cannot be followed by resurrected model-sync work.
- Webhook notification remains fire-and-forget on the request path; the process-global pending set exists only for lifecycle drain/accounting. Its leaf drain does not invent a second timeout: the coordinator's one absolute deadline is the only shutdown budget.
- OTLP final shutdown flush is awaitable. If the collector rejects the final delivery opportunity, remaining buffered events are counted as dropped rather than silently left buffered at process exit.
- Hook timeout consumes the remaining global shutdown budget. Later phases are marked `skipped_deadline`; hook rejection (without deadline exhaustion) is recorded and later phases still run.
- The custom Next runner initiates `server.close()` before application drain but defers awaiting it; otherwise active SSE/keep-alive sockets could block before lifecycle drain is invoked. Remaining connections are force-closed only after application drain, then Next closes, then the Rust child stops.
