import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-semcache-optin-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";
delete process.env.AGENTPROXY_SEMANTIC_CACHE_ENABLED;

const core = await import("../../src/lib/db/core.ts");
const { DEFAULT_SEMANTIC_CACHE_CONFIG, resolveSemanticCacheConfig } =
  await import("../../open-sse/config/semanticCacheConfig.ts");
const { ensureSemanticCacheDbBridge } =
  await import("../../src/lib/cache/semanticCacheDbBridge.ts");
const { getDatabaseSettings, updateDatabaseSettings } =
  await import("../../src/lib/db/databaseSettings.ts");
const { DEFAULT_DATABASE_SETTINGS } = await import("../../src/types/databaseSettings.ts");
const { SemanticCacheManager } =
  await import("../../open-sse/services/cache/semanticCacheManager.ts");
const { MemoryVectorStore } = await import("../../open-sse/services/cache/memoryVectorStore.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("dual-layer manager is off by default while legacy cache stays enabled", () => {
  assert.equal(DEFAULT_SEMANTIC_CACHE_CONFIG.enabled, false);
  assert.equal(DEFAULT_DATABASE_SETTINGS.cache.semanticCacheVectorEnabled, false);
  assert.equal(DEFAULT_DATABASE_SETTINGS.cache.semanticCacheEnabled, true);
});

test("DB bridge enables vector caching only when master and vector toggles are both on", () => {
  ensureSemanticCacheDbBridge();
  assert.equal(getDatabaseSettings().cache.semanticCacheEnabled, true);
  assert.equal(resolveSemanticCacheConfig().enabled, false);

  updateDatabaseSettings({ cache: { semanticCacheVectorEnabled: true } });
  assert.equal(resolveSemanticCacheConfig().enabled, true);

  updateDatabaseSettings({ cache: { semanticCacheEnabled: false } });
  assert.equal(resolveSemanticCacheConfig().enabled, false);
});

test("AgentProxy cache headers are canonical and OmniRoute headers remain migration aliases", async () => {
  const manager = new SemanticCacheManager(
    { enabled: true, requireZeroTemperature: false },
    new MemoryVectorStore(),
    async () => ({ embedding: [1, 0], dimensions: 2 })
  );
  const base = {
    body: { messages: [{ role: "user", content: "hello" }], temperature: 0 },
    response: { id: "cached", choices: [] },
    model: "gpt-test",
    provider: "openai",
    tokensSaved: 7,
  };
  await manager.store({ ...base, headers: { "x-agentproxy-cache-key": "agent" } });
  const agent = await manager.lookup({
    body: base.body,
    headers: { "x-agentproxy-cache-key": "agent", "x-agentproxy-cache-type": "direct" },
    model: base.model,
    provider: base.provider,
    stream: false,
  });
  assert.equal(agent.hit, true);

  await manager.store({ ...base, headers: { "x-omniroute-cache-key": "legacy" } });
  const legacy = await manager.lookup({
    body: base.body,
    headers: { "x-omniroute-cache-key": "legacy", "x-omniroute-cache-type": "direct" },
    model: base.model,
    provider: base.provider,
    stream: false,
  });
  assert.equal(legacy.hit, true);
});

test("AgentProxy no-store header prevents vector writes", async () => {
  const store = new MemoryVectorStore();
  const manager = new SemanticCacheManager(
    { enabled: true, requireZeroTemperature: false },
    store,
    async () => ({ embedding: [1, 0], dimensions: 2 })
  );
  await manager.store({
    body: { messages: [{ role: "user", content: "secret" }], temperature: 0 },
    headers: { "x-agentproxy-cache-no-store": "true" },
    response: { id: "must-not-store" },
    model: "gpt-test",
    provider: "openai",
  });
  assert.equal((await store.getStats()).entries, 0);
});
