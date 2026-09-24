import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-9147-"));
const ORIGINAL_CATALOG_BUILD_TIMEOUT_MS = process.env.CATALOG_BUILD_TIMEOUT_MS;
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "catalog-9147-test-secret";
// This probe measures event-loop yielding, not cold-build timeout behavior (#12627).
// Give the synthetic catalog-scale build enough wall-clock headroom on slower runners
// so the test reaches its max-gap assertion instead of being preempted at 8s.
process.env.CATALOG_BUILD_TIMEOUT_MS = "30000";

const core = await import("../../src/lib/db/core.ts");
const apiKeysDb = await import("../../src/lib/db/apiKeys.ts");
const v1ModelsCatalog = await import("../../src/app/api/v1/models/catalog.ts");

const CONNECTION_COUNT = 60;
const MODELS_PER_CONNECTION = 12; // ~720 synced models total

async function resetStorage() {
  core.resetDbInstance();
  apiKeysDb.resetApiKeyState();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  v1ModelsCatalog.__resetCatalogBuilderRunsForTest();
}

async function seedCatalogScaleDataset() {
  const db = core.getDbInstance();
  const now = new Date().toISOString();
  const insertConn = db.prepare(
    `INSERT INTO provider_connections (id, provider, auth_type, name, priority, is_active, api_key, created_at, updated_at)
     VALUES (?, 'openai-compatible', 'apikey', ?, ?, 1, ?, ?, ?)`
  );
  const insertModels = db.prepare(
    `INSERT INTO key_value (namespace, key, value) VALUES ('syncedAvailableModels', ?, ?)`
  );
  const seedTx = db.transaction(() => {
    for (let i = 0; i < CONNECTION_COUNT; i++) {
      const id = `probe-conn-${i}`;
      insertConn.run(id, `probe-connection-${i}`, i, `sk-probe-${i}`, now, now);
      const models = Array.from({ length: MODELS_PER_CONNECTION }, (_, m) => ({
        id: `probe-model-${i}-${m}`,
        name: `Probe Model ${i}-${m}`,
        contextLength: 128000,
      }));
      insertModels.run(`openai-compatible:${id}`, JSON.stringify(models));
    }
  });
  seedTx();
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(async () => {
  core.resetDbInstance();
  apiKeysDb.resetApiKeyState();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (ORIGINAL_CATALOG_BUILD_TIMEOUT_MS === undefined) delete process.env.CATALOG_BUILD_TIMEOUT_MS;
  else process.env.CATALOG_BUILD_TIMEOUT_MS = ORIGINAL_CATALOG_BUILD_TIMEOUT_MS;
});

test("#9147 — catalog build at catalog-scale must not pin the event loop for a long stretch", async (t) => {
  await seedCatalogScaleDataset();
  const req = new Request("http://localhost/v1/models");
  let settled = false;
  const buildPromise = v1ModelsCatalog.getUnifiedModelsResponse(req).then((res) => {
    settled = true;
    return res;
  });
  let lastTick = performance.now();
  let maxGapMs = 0;
  let maxCpuGapMs = 0;
  let cpuCheckpoint = process.cpuUsage();
  let ticks = 0;
  while (!settled) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const now = performance.now();
    maxGapMs = Math.max(maxGapMs, now - lastTick);
    const cpuDelta = process.cpuUsage(cpuCheckpoint);
    cpuCheckpoint = process.cpuUsage();
    maxCpuGapMs = Math.max(maxCpuGapMs, (cpuDelta.user + cpuDelta.system) / 1000);
    lastTick = now;
    ticks++;
    if (ticks > 20000) break;
  }
  const res = await buildPromise;
  assert.equal(res.status, 200);
  t.diagnostic(
    `maximum event-loop gap: ${maxGapMs.toFixed(1)}ms; max process CPU between ticks: ${maxCpuGapMs.toFixed(1)}ms across ${ticks} interleaved ticks`
  );
  // Wall-clock delay on an oversubscribed runner includes time when this process is
  // descheduled. Keep a catastrophe wall bound and a CPU catastrophe bound, while
  // requiring a substantial number of interleaved timer ticks as the direct evidence
  // that the catalog builder keeps yielding.
  // Hosted evidence: 785.9ms / 808 ticks passed, while 810.4ms / 843 ticks failed the
  // old 800ms cutoff despite demonstrating at least as much yielding. The former
  // threshold sat inside normal runner variance instead of separating pinned from
  // responsive behavior.
  assert.ok(
    maxGapMs < 2500,
    `event loop had a catastrophic ${maxGapMs.toFixed(1)}ms wall gap while building the catalog`
  );
  assert.ok(
    maxCpuGapMs < 1000,
    `catalog builder consumed ${maxCpuGapMs.toFixed(1)}ms of process CPU without yielding for ` +
      `${CONNECTION_COUNT} connections / ${CONNECTION_COUNT * MODELS_PER_CONNECTION} models ` +
      `(${ticks} interleaved ticks observed)`
  );
  assert.ok(ticks >= 500, `catalog builder yielded only ${ticks} interleaved ticks`);
  const body = (await res.json()) as { data?: Array<{ root?: string }> };
  assert.ok(
    body.data?.some((model) => model.root === "probe-model-59-11"),
    "the responsiveness probe must still traverse and return the last seeded catalog model"
  );
});
