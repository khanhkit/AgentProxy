/**
 * AP-ISS-0125 / upstream #12849:
 * a synced catalog must stop being authoritative when its connection timestamp is stale.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-stale-catalog-0125-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "ap-iss-0125-stale-catalog-secret";

const core = await import("../../src/lib/db/core.ts");
const { replaceSyncedAvailableModelsForConnection } = await import("../../src/lib/db/models.ts");
const { getModelInfo } = await import("../../src/sse/services/model.ts");
const { nvidiaProvider } = await import("../../open-sse/config/providers/registry/nvidia/index.ts");

const PROVIDER = "nvidia";
const CONNECTION_ID = "ap-iss-0125-stale-catalog";
const LIVE_MODEL = "moonshotai/kimi-k3";
const STALE_SYNC_ONLY_MODEL = "some-retired-model-that-no-longer-exists";

function connectionRow(): { syncedModelsAt: string | null } {
  const db = core.getDbInstance();
  const row = db
    .prepare("SELECT synced_models_at AS syncedModelsAt FROM provider_connections WHERE id = ?")
    .get(CONNECTION_ID) as { syncedModelsAt: string | null } | undefined;
  if (!row) throw new Error(`connection ${CONNECTION_ID} not found`);
  return row;
}

function ageConnectionSync(daysAgo: number): void {
  const db = core.getDbInstance();
  const agedTimestamp = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("UPDATE provider_connections SET synced_models_at = ? WHERE id = ?").run(
    agedTimestamp,
    CONNECTION_ID
  );
}

async function seedHistoricalSync(): Promise<void> {
  const db = core.getDbInstance();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO provider_connections (id, provider, is_active, created_at, updated_at)
     VALUES (?, ?, 1, ?, ?)`
  ).run(CONNECTION_ID, PROVIDER, now, now);
  await replaceSyncedAvailableModelsForConnection(PROVIDER, CONNECTION_ID, [
    { id: STALE_SYNC_ONLY_MODEL, name: STALE_SYNC_ONLY_MODEL, source: "imported" },
  ]);
}

test.beforeEach(async () => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  assert.ok(
    nvidiaProvider.models.some((model) => model.id === LIVE_MODEL),
    `precondition: ${LIVE_MODEL} must exist in NVIDIA static registry`
  );
  await seedHistoricalSync();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("TC-OMNIDB-CATALOG-003: fresh synced catalog stamps timestamp and still gates", async () => {
  assert.ok(connectionRow().syncedModelsAt, "sync must stamp synced_models_at");
  const resolved = await getModelInfo(`${PROVIDER}/${LIVE_MODEL}`);
  assert.equal(resolved.provider, null);
  assert.equal(resolved.errorType, "model_not_found");
  assert.match(resolved.errorMessage, /active live catalog/i);
});

test("TC-OMNIDB-CATALOG-004: stale synced catalog fails open", async () => {
  ageConnectionSync(45);
  const resolved = await getModelInfo(`${PROVIDER}/${LIVE_MODEL}`);
  assert.equal(resolved.provider, PROVIDER);
  assert.equal(resolved.model, LIVE_MODEL);
});

test("TC-OMNIDB-CATALOG-005: never-timestamped catalog is non-authoritative", async () => {
  const db = core.getDbInstance();
  db.prepare("UPDATE provider_connections SET synced_models_at = NULL WHERE id = ?").run(CONNECTION_ID);
  const resolved = await getModelInfo(`${PROVIDER}/${LIVE_MODEL}`);
  assert.equal(resolved.provider, PROVIDER);
  assert.equal(resolved.model, LIVE_MODEL);
});

test("TC-OMNIDB-CATALOG-006: AgentProxy staleness threshold override is honored", async () => {
  const previous = process.env.AGENTPROXY_SYNCED_CATALOG_STALE_AFTER_MS;
  process.env.AGENTPROXY_SYNCED_CATALOG_STALE_AFTER_MS = String(60 * 60 * 1000);
  try {
    ageConnectionSync(1);
    const resolved = await getModelInfo(`${PROVIDER}/${LIVE_MODEL}`);
    assert.equal(resolved.provider, PROVIDER);
  } finally {
    if (previous === undefined) delete process.env.AGENTPROXY_SYNCED_CATALOG_STALE_AFTER_MS;
    else process.env.AGENTPROXY_SYNCED_CATALOG_STALE_AFTER_MS = previous;
  }
});
