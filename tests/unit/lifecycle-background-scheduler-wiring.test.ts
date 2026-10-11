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
    assert.match(source(path), /[Ss]tartupTimer/, `${path} must retain/cancel its delayed startup timer`);
  }
});

test("auxiliary HTTP listeners expose explicit lifecycle stop APIs", () => {
  assert.match(source("src/lib/apiBridgeServer.ts"), /export function stopApiBridgeServer/);
  assert.match(source("src/server/ws/liveServer.ts"), /export (?:async )?function stopLiveDashboardServer/);
});
