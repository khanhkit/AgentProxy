import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

test("direct serve shutdown uses the platform-aware graceful child stop helper", () => {
  const text = source("bin/cli/commands/serve.mjs");
  assert.match(text, /stopProcessGracefully/);
  const shutdown = text.slice(
    text.indexOf("const shutdown = () =>"),
    text.indexOf('process.on("SIGINT"', text.indexOf("const shutdown = () =>"))
  );
  assert.match(shutdown, /stopProcessGracefully\(\{/);
  assert.doesNotMatch(shutdown, /server\.kill\(\"SIGTERM\"\)/);
});

test("supervisor broad cleanup excludes the child already undergoing graceful stop", () => {
  const supervisor = source("bin/cli/runtime/processSupervisor.mjs");
  const pid = source("bin/cli/utils/pid.mjs");
  assert.match(pid, /killAllSubprocesses\([^)]*excludePids/);
  assert.match(
    supervisor,
    /killAllSubprocesses\(\{\s*excludePids:\s*\[childPid, process\.pid\]/,
    "supervisor cleanup must exclude both the gracefully-stopping child and itself"
  );
});

test("rate-limit shutdown stops limiters before final persistence can block", () => {
  const text = source("open-sse/services/rateLimitManager.ts");
  const body = text.slice(
    text.indexOf("export function shutdownRateLimitManager"),
    text.indexOf("globalThis.__agentproxyShutdownRateLimit")
  );
  const stop = body.indexOf("limiter.stop");
  const persist = body.indexOf("persistLearnedLimitsNow");
  assert.ok(
    stop >= 0 && persist >= 0 && stop < persist,
    "limiter stop must precede final persistence"
  );
});

test("routing observability stays initialized until the old sink finishes stopping", () => {
  const text = source("open-sse/services/routing/index.ts");
  const body = text.slice(
    text.indexOf("export async function shutdownRoutingObservability"),
    text.indexOf("function listRoutingSinkNames")
  );
  const stop = body.indexOf("await sink.stop()");
  const clear = body.lastIndexOf("initialized = false");
  assert.ok(stop >= 0 && clear > stop, "re-init must stay blocked while sink.stop is in flight");
});

test("background lifecycle tracking only accepts lazy work factories", () => {
  const tracker = source("src/lib/lifecycle/backgroundTasks.ts");
  assert.doesNotMatch(tracker, /promise:\s*Promise<T>/);
  assert.doesNotMatch(tracker, /Promise<T>\s*\|\s*\(\(\) => Promise<T>\)/);

  const lazyContracts: Array<[string, RegExp]> = [
    [
      "src/lib/arenaEloSync.ts",
      /trackLifecycleBackgroundTask\("arena-elo-sync",\s*\(\) => syncArenaElo\(\)\)/,
    ],
    [
      "src/lib/contextWindowResolver.ts",
      /"context-window-reconcile",\s*\(\) =>\s*runContextWindowReconcile\(\)/,
    ],
    [
      "src/lib/db/cleanup.ts",
      /trackLifecycleBackgroundTask\("db-cleanup",\s*\(\) => runScheduledCleanupPass\(phase\)\)/,
    ],
    [
      "src/lib/db/vacuumScheduler.ts",
      /trackLifecycleBackgroundTask\("db-vacuum",\s*\(\) => runNow\(\)\)/,
    ],
    [
      "src/lib/jobs/backupScheduleJob.ts",
      /trackLifecycleBackgroundTask\("backup-schedule",\s*runBackupScheduleTick\)/,
    ],
    [
      "src/lib/memory/typedDecay.ts",
      /trackLifecycleBackgroundTask\("memory-decay-sweep",\s*\(\) =>\s*sweepDecayedMemories/,
    ],
    ["src/lib/modelsDevSync.ts", /"models-dev-sync",\s*\(\) =>\s*syncModelsDev/],
    ["src/lib/freeProxyProviders/scheduler.ts", /"free-proxy-sync-bootstrap",\s*async \(\) =>/],
    [
      "src/server/ws/liveServer.ts",
      /trackLifecycleBackgroundTask\("live-ws-startup",\s*\(\) =>\s*startLiveDashboardServer/,
    ],
  ];
  for (const [file, pattern] of lazyContracts) assert.match(source(file), pattern, file);
  assert.doesNotMatch(
    source("src/lib/arenaEloSync.ts"),
    /trackLifecycleBackgroundTask\("arena-elo-sync",\s*syncArenaElo\(\)\)/,
    "all Arena ELO launches must be admitted lazily"
  );
});

test("fallback signal owner normalizes synchronous shutdown handlers to a promise", () => {
  assert.match(
    source("src/lib/gracefulShutdown.ts"),
    /Promise\.resolve\(globalThis\.__agentproxyRequestShutdown\?\.\(signal\)\)\.then/
  );
});

test("proxy-health recurring sweeps use an in-flight guard", () => {
  const text = source("src/lib/proxyHealth/scheduler.ts");
  assert.match(text, /sweepInFlight/);
  assert.match(text, /if \(sweepInFlight\) return/);
});

test("radar recurring ticks use an in-flight guard", () => {
  const text = source("src/lib/radar/scheduler.ts");
  assert.match(text, /tickInFlight/);
  assert.match(text, /if \(tickInFlight\) return/);
});

test("LiveWS re-checks draining state after waiting for the prior listener close", () => {
  const text = source("src/server/ws/liveServer.ts");
  const start = text.slice(
    text.indexOf("export async function startLiveDashboardServer"),
    text.indexOf("/** Stop accepting live dashboard")
  );
  assert.match(start, /await liveWsClosePromise;[\s\S]*?isDraining\(\)/);
});
