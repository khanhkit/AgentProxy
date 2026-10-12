import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const dbOrDurableBackgroundOwners = [
  "src/domain/quotaCache.ts",
  "src/lib/services/quotaAutoPing.ts",
  "src/lib/catalog/openrouterProviderStats.ts",
  "src/lib/modelsDevSync.ts",
  "src/lib/db/cleanup.ts",
  "src/lib/proxyHealth/scheduler.ts",
  "src/lib/freeProxyProviders/scheduler.ts",
  "src/lib/credentialHealth/scheduler.ts",
  "src/lib/db/vacuumScheduler.ts",
  "src/lib/quota/connectionRecovery.ts",
  "src/lib/arenaEloSync.ts",
  "src/lib/radar/scheduler.ts",
  "src/lib/pricingSync.ts",
  "src/lib/contextWindowResolver.ts",
  "src/lib/memory/typedDecay.ts",
  "src/lib/jobs/backupScheduleJob.ts",
];

test("main-runtime durable background schedulers register active work with lifecycle drain", () => {
  for (const path of dbOrDurableBackgroundOwners) {
    assert.match(
      source(path),
      /trackLifecycleBackgroundTask/,
      `${path} must track its fire-and-forget scheduler work for shutdown drain`
    );
  }
});

test("delayed scheduler starters reject duplicate init while startup is pending", () => {
  assert.match(
    source("src/lib/db/cleanup.ts"),
    /if \(_cleanupSchedulerTimer \|\| startupTimer\) return;/,
    "cleanup scheduler must not arm duplicate startup timers"
  );
  assert.match(
    source("src/lib/proxyHealth/scheduler.ts"),
    /if \(globalThis\.__proxyHealthInterval \|\| globalThis\.__proxyHealthStartupTimer\) return;/,
    "proxy health scheduler must not arm duplicate startup timers"
  );
});

test("delayed scheduler starters retain a cancellable startup timer", () => {
  for (const path of [
    "src/lib/db/cleanup.ts",
    "src/lib/proxyHealth/scheduler.ts",
    "src/lib/quota/connectionRecovery.ts",
    "src/lib/contextWindowResolver.ts",
    "src/lib/memory/typedDecay.ts",
  ]) {
    assert.match(
      source(path),
      /[Ss]tartupTimer/,
      `${path} must retain/cancel its delayed startup timer`
    );
  }
});

test("auxiliary HTTP listeners expose explicit lifecycle stop APIs", () => {
  assert.match(source("src/lib/apiBridgeServer.ts"), /export function stopApiBridgeServer/);
  assert.match(
    source("src/server/ws/liveServer.ts"),
    /export (?:async )?function stopLiveDashboardServer/
  );
});

test("main lifecycle does not trace heavyweight MITM/rate-limit leaves solely for shutdown", () => {
  const graceful = source("src/lib/gracefulShutdown.ts");
  assert.doesNotMatch(graceful, /import\("@\/mitm\/manager"\)/);
  assert.doesNotMatch(
    graceful,
    /import\("@agentproxy\/open-sse\/services\/rateLimitManager\.ts"\)/
  );
  assert.match(graceful, /__agentproxyShutdownMitm/);
  assert.match(graceful, /__agentproxyShutdownRateLimit/);
});

test("lifecycle startup races cannot resurrect stopped listeners", () => {
  const liveWs = source("src/server/ws/liveServer.ts");
  assert.match(
    liveWs,
    /__agentproxyLiveWsServer !== server[\s\S]*?wss\.close\(\)[\s\S]*?server\.close\(\)[\s\S]*?reject\(/,
    "preempted LiveWS startup must close both WS and HTTP handles and reject startup"
  );
});

test("provider limits scheduler recovers from setup failure", () => {
  const providerLimits = source("src/shared/services/providerLimitsSyncScheduler.ts");
  assert.match(
    providerLimits,
    /\(error\) => \{[\s\S]*?startupSetup === setup[\s\S]*?schedulerEnabled = false/,
    "setup failure must release the scheduler running guard so a later start can retry"
  );
  assert.doesNotMatch(
    providerLimits,
    /void cycle\.finally\(/,
    "cycle cleanup must not create a discarded rejecting finally promise"
  );
  assert.match(
    providerLimits,
    /if \(schedulerTimer \|\| startupTimer \|\| startupSetup \|\| schedulerEnabled\)/,
    "a pending setup must block a replacement scheduler start"
  );
  assert.match(
    providerLimits,
    /if \(!schedulerEnabled \|\| startupSetup !== setup\) return;/,
    "an obsolete async setup must not arm timers after stop/restart"
  );
});

test("main lifecycle validates invalid shutdown timeout values", () => {
  const graceful = source("src/lib/gracefulShutdown.ts");
  assert.match(
    graceful,
    /const\s+parsedShutdownTimeoutMs\s*=\s*Number\(process\.env\.SHUTDOWN_TIMEOUT_MS[\s\S]*?Number\.isFinite\(parsedShutdownTimeoutMs\)[\s\S]*?parsedShutdownTimeoutMs\s*>=\s*0/,
    "main lifecycle must reject partial numeric timeout strings and share zero/invalid semantics with the runner"
  );
});

test("MITM detector dispatch stays exhaustive when AgentId grows", () => {
  const detection = source("src/mitm/detection/index.ts");
  assert.match(detection, /Record<AgentId, \(\) => DetectionResult>/);
  assert.match(detection, /["']ghe-copilot["']\s*:/);
});

test("rate-limit lifecycle stops scheduling before active drains and tears down after producers quiesce", () => {
  const graceful = source("src/lib/gracefulShutdown.ts");
  const manager = source("open-sse/services/rateLimitManager.ts");
  assert.match(manager, /__agentproxyStopRateLimitWatchdog/);
  assert.match(
    graceful,
    /register\("rate-limit-scheduler",\s*"STOP_SCHEDULERS"[\s\S]*?__agentproxyStopRateLimitWatchdog/
  );
  assert.match(
    graceful,
    /register\("rate-limit-drain",\s*"FLUSH_DURABLE"[\s\S]*?__agentproxyShutdownRateLimit/
  );
});

test("scheduler lifecycle error paths stay observable and drains cannot resurrect timers", () => {
  const credential = source("src/lib/credentialHealth/scheduler.ts");
  assert.match(
    credential,
    /trackLifecycleBackgroundTask\("credential-health-sweep", sweep\(\)\)\.catch/
  );

  const freeProxy = source("src/lib/freeProxyProviders/scheduler.ts");
  assert.match(
    freeProxy,
    /trackLifecycleBackgroundTask\([\s\S]*?"free-proxy-sync-bootstrap"[\s\S]*?\)\.catch/
  );

  const graceful = source("src/lib/gracefulShutdown.ts");
  assert.match(graceful, /stopProviderLimitsSyncScheduler\(\)/);
  assert.match(graceful, /stopModelSyncScheduler\(\)/);
});

test("rate-limit shutdown continues limiter cleanup when persistence fails", () => {
  const manager = source("open-sse/services/rateLimitManager.ts");
  assert.match(manager, /let\s+persistenceError/);
  assert.match(manager, /catch\s*\(error\)[\s\S]*?persistenceError\s*=\s*error[\s\S]*?const stops/);
  assert.match(
    manager,
    /limiters\.clear\(\)[\s\S]*?if\s*\(persistenceError\)\s*throw\s+persistenceError/
  );
});

test("review-touched runtime inputs are validated before typed persistence", () => {
  const providerTest = source("src/app/api/providers/[id]/test/route.ts");
  assert.match(providerTest, /Number\.isFinite\(expiresIn\)[\s\S]*?expiresIn\s*>\s*0/);

  const inspectorTypes = source("src/mitm/inspector/types.ts");
  assert.match(inspectorTypes, /agent:\s*MitmTargetSchema\.shape\.id\.optional\(\)/);
});

test("LiveWS shutdown publishes an awaitable close drain", () => {
  const liveWs = source("src/server/ws/liveServer.ts");
  const graceful = source("src/lib/gracefulShutdown.ts");
  assert.match(liveWs, /__agentproxyDrainLiveWs/);
  assert.match(liveWs, /export async function drainLiveDashboardServer/);
  assert.match(
    graceful,
    /register\("live-ws-drain",\s*"DRAIN_ACTIVE"[\s\S]*?__agentproxyDrainLiveWs/
  );
});

test("LiveWS bind failure clears lifecycle ownership before rejecting", () => {
  const liveWs = source("src/server/ws/liveServer.ts");
  assert.match(
    liveWs,
    /wss\.once\("error"[\s\S]*?__agentproxyLiveWsServer === server[\s\S]*?__agentproxyLiveWsWss === wss/
  );
});
