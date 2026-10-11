/**
 * Main-runtime graceful shutdown composition.
 *
 * One lifecycle coordinator owns ordered application cleanup. The active
 * process entrypoint owns OS signals and final process.exit(); this module only
 * installs fallback signal ownership when no custom server owner is present.
 */

import { markServerStopping } from "@/lib/serverLifecycle";
import {
  registerLifecycleHook,
  runLifecycleShutdown,
  type LifecyclePhase,
  type LifecycleShutdownReport,
} from "@/lib/lifecycle/coordinator";

const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || "30000", 10);
const DRAIN_POLL_INTERVAL_MS = 250;

declare global {
  var __agentproxyShutdown:
    | {
        init: boolean;
        shuttingDown: boolean;
        activeRequests: number;
        shutdownPromise?: Promise<LifecycleShutdownReport>;
      }
    | undefined;
  var __agentproxyRequestShutdown:
    | ((signal: string) => Promise<LifecycleShutdownReport | void>)
    | undefined;
  var __agentproxyCustomServerOwnsShutdown: boolean | undefined;
  var __agentproxyStopApiBridge: (() => void) | undefined;
  var __agentproxyStopLiveWs: (() => void) | undefined;
  var __agentproxyShutdownRateLimit: (() => Promise<void>) | undefined;
  var __agentproxyShutdownMitm: (() => Promise<void>) | undefined;
}

function getShutdownState() {
  if (!globalThis.__agentproxyShutdown) {
    globalThis.__agentproxyShutdown = { init: false, shuttingDown: false, activeRequests: 0 };
  }
  return globalThis.__agentproxyShutdown;
}

function register(name: string, phase: LifecyclePhase, run: () => void | Promise<void>): void {
  registerLifecycleHook({ name, phase, run });
}

/**
 * Register main-runtime lifecycle hooks. Registration is name-idempotent and
 * process-global, so HMR/module duplication replaces rather than accumulates.
 */
export function registerMainLifecycleHooks(): void {
  register("server-admission", "STOP_ADMISSION", () => markServerStopping());
  register("api-bridge-admission", "STOP_ADMISSION", () => {
    globalThis.__agentproxyStopApiBridge?.();
  });
  register("live-ws-admission", "STOP_ADMISSION", () => {
    globalThis.__agentproxyStopLiveWs?.();
  });

  register("job-registry-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/jobRegistry")).getJobRegistry().stopAll();
  });
  register("batch-processor-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@agentproxy/open-sse/services/batchProcessor.ts")).stopBatchProcessor();
  });
  register("quota-cache-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/domain/quotaCache")).stopBackgroundRefresh();
  });
  register("provider-limits-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/shared/services/providerLimitsSyncScheduler")).stopProviderLimitsSyncScheduler();
  });
  register("quota-auto-ping-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/services/quotaAutoPing")).stopQuotaAutoPing();
  });
  register("model-sync-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/shared/services/modelSyncScheduler")).stopModelSyncScheduler();
  });
  register("models-dev-sync-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/modelsDevSync")).stopPeriodicSync();
  });
  register("runtime-config-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/config/hotReload")).stopRuntimeConfigHotReload();
  });
  register("db-cleanup-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/db/cleanup")).stopCleanupScheduler();
  });
  register("proxy-health-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/proxyHealth/scheduler")).stopProxyHealthCheck();
  });
  register("free-proxy-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/freeProxyProviders/scheduler")).stopFreeProxyAutoSync();
  });
  register("session-affinity-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/db/sessionAccountAffinity")).stopSessionAccountAffinityCleanup();
  });
  register("credential-health-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/credentialHealth/scheduler")).stopCredentialHealthCheck();
  });
  register("vacuum-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/db/vacuumScheduler")).stop();
  });
  register("auto-refresh-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@agentproxy/open-sse/services/autoRefreshDaemon.ts")).autoRefreshDaemon.stop();
  });
  register("conductor-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/conductor/boot")).stopConductorBridge();
  });
  register("connection-recovery-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/quota/connectionRecovery")).stopConnectionRecoveryScheduler();
  });
  register("arena-elo-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/arenaEloSync")).stopArenaEloSync();
  });
  register("radar-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/radar/scheduler")).stopRadarSyncScheduler();
  });
  register("pricing-sync-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/pricingSync")).stopPeriodicSync();
  });
  register("openrouter-stats-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/catalog/openrouterProviderStats")).stopOpenRouterProviderStatsSync();
  });
  register("context-window-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/contextWindowResolver")).stopContextWindowReconcile();
  });
  register("memory-decay-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/memory/typedDecay")).stopMemoryDecaySweep();
  });
  register("backup-schedule-scheduler", "STOP_SCHEDULERS", async () => {
    (await import("@/lib/jobs/backupScheduleJob")).stopBackupScheduleJob();
  });

  register("request-drain", "DRAIN_ACTIVE", waitForRequestDrain);
  register("background-task-drain", "DRAIN_ACTIVE", async () => {
    await (await import("@/lib/lifecycle/backgroundTasks")).drainLifecycleBackgroundTasks();
  });
  register("job-registry-drain", "DRAIN_ACTIVE", async () => {
    await (await import("@/lib/jobRegistry")).getJobRegistry().drain();
  });
  register("batch-processor-drain", "DRAIN_ACTIVE", async () => {
    await (await import("@agentproxy/open-sse/services/batchProcessor.ts")).waitForAllBatches();
  });
  register("provider-limits-drain", "DRAIN_ACTIVE", async () => {
    await (await import("@/shared/services/providerLimitsSyncScheduler")).drainProviderLimitsSyncScheduler();
  });
  register("model-sync-drain", "DRAIN_ACTIVE", async () => {
    await (await import("@/shared/services/modelSyncScheduler")).drainModelSyncScheduler();
  });
  register("runtime-config-drain", "DRAIN_ACTIVE", async () => {
    await (await import("@/lib/config/hotReload")).drainRuntimeConfigHotReload();
  });
  register("service-supervisors-drain", "DRAIN_ACTIVE", async () => {
    await (await import("@/lib/services/registry")).stopAllSupervisors();
  });
  // Heavy leaves publish these handles when loaded; importing them here would
  // expand Next's instrumentation webpack graph solely for shutdown.
  register("rate-limit-drain", "DRAIN_ACTIVE", async () => {
    await globalThis.__agentproxyShutdownRateLimit?.();
  });
  register("mitm-drain", "DRAIN_ACTIVE", async () => {
    await globalThis.__agentproxyShutdownMitm?.();
  });

  register("spend-writer-flush", "FLUSH_DURABLE", async () => {
    const result = await (await import("@/lib/spend/batchWriter")).stopSpendBatchWriter();
    if (result.flushedEntries > 0) {
      console.log(`[Shutdown] Spend writer flushed ${result.flushedEntries} pending entry(ies).`);
    }
  });
  register("call-log-flush", "FLUSH_DURABLE", async () => {
    await (await import("@/lib/usage/callLogs")).closeCallLogSaves();
  });
  register("webhook-delivery-drain", "FLUSH_DURABLE", async () => {
    const stats = await (await import("@/lib/webhookDispatcher")).drainPendingWebhookDeliveries();
    if (stats.failed > 0) {
      console.warn(`[Shutdown] Webhooks completed with ${stats.failed} failed delivery task(s).`);
    }
  });
  register("routing-observability-flush", "FLUSH_DURABLE", async () => {
    await (await import("@agentproxy/open-sse/services/routing/index.ts")).shutdownRoutingObservability();
  });

  register("mcp-audit-db-close", "CLOSE_RESOURCES", async () => {
    if ((await import("@agentproxy/open-sse/mcp-server/audit.ts")).closeAuditDb()) {
      console.log("[Shutdown] MCP audit database checkpointed and closed.");
    }
  });
  register("core-db-close", "CLOSE_RESOURCES", async () => {
    if ((await import("@/lib/db/core")).closeDbInstance()) {
      console.log("[Shutdown] SQLite database checkpointed and closed.");
    }
  });
  register("logger-resources-close", "CLOSE_RESOURCES", async () => {
    const [{ closeLogRotation }, { closeSharedLoggerResource }] = await Promise.all([
      import("@/lib/logRotation"),
      import("@/shared/utils/loggerResource"),
    ]);
    await closeSharedLoggerResource();
    closeLogRotation();
  });

  register("vnc-sessions-stop", "STOP_CHILDREN", async () => {
    try {
      const { stopAllSessions, listSessions } = await import("@/lib/vncSession/service");
      if (listSessions().length > 0) await stopAllSessions();
    } catch {
      // Optional feature / docker missing.
    }
  });
  register("chatgpt-web-runtime-stop", "STOP_CHILDREN", async () => {
    try {
      await (
        await import("@agentproxy/open-sse/executors/chatgpt-web-codex/runtime.ts")
      ).stopChatGptWebCodexRuntime();
    } catch {
      // Optional feature unused.
    }
  });
}

export function isDraining(): boolean {
  return getShutdownState().shuttingDown;
}

export function trackRequest(): () => void {
  const state = getShutdownState();
  state.activeRequests++;
  let called = false;
  return () => {
    if (!called) {
      called = true;
      state.activeRequests--;
    }
  };
}

export function getActiveRequestCount(): number {
  return getShutdownState().activeRequests;
}

async function waitForRequestDrain(): Promise<void> {
  const state = getShutdownState();
  while (state.activeRequests > 0) {
    console.log(`[Shutdown] Waiting for ${state.activeRequests} in-flight request(s)...`);
    await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_INTERVAL_MS));
  }
  console.log("[Shutdown] All in-flight requests drained.");
}

export function requestGracefulShutdown(signal: string): Promise<LifecycleShutdownReport> {
  const state = getShutdownState();
  if (state.shutdownPromise) return state.shutdownPromise;

  state.shuttingDown = true;
  registerMainLifecycleHooks();
  state.shutdownPromise = (async () => {
    console.log(`\n[Shutdown] Received ${signal}. Draining ${state.activeRequests} request(s)...`);
    const report = await runLifecycleShutdown({ timeoutMs: SHUTDOWN_TIMEOUT_MS });
    for (const result of report.results) {
      if (result.status !== "ok") {
        console.error(
          `[Shutdown] ${result.phase}/${result.name}: ${result.status}${result.error ? ` (${result.error})` : ""}`
        );
      }
    }
    console.log(report.clean ? "[Shutdown] Bye." : "[Shutdown] Cleanup completed with failures.");
    return report;
  })();

  return state.shutdownPromise;
}

export function initGracefulShutdown(): void {
  const state = getShutdownState();
  registerMainLifecycleHooks();
  globalThis.__agentproxyRequestShutdown ??= requestGracefulShutdown;
  if (state.init) return;
  state.init = true;

  if (globalThis.__agentproxyCustomServerOwnsShutdown) {
    console.log("[Shutdown] Cleanup registered with the custom server shutdown owner.");
    return;
  }

  const shutdown = (signal: string) => {
    void globalThis.__agentproxyRequestShutdown?.(signal).then((report) => {
      // Give sql.js/Emscripten one macrotask to settle libuv async teardown.
      const clean = !report || report.clean !== false;
      setTimeout(() => process.exit(clean ? 0 : 1), 0);
    });
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGHUP", () => void shutdown("SIGHUP"));

  console.log("[Shutdown] Graceful shutdown handlers registered.");
}
