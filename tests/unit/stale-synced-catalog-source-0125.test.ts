import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

test("TC-OMNIDB-CATALOG-003A: migration 177 adds synced_models_at", () => {
  const sql = read("src/lib/db/migrations/177_provider_connection_synced_models_at.sql");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE provider_connections (id TEXT PRIMARY KEY)");
    db.exec(sql);
    const columns = db.prepare("PRAGMA table_info(provider_connections)").all().map((r) => (r as { name: unknown }).name);
    assert.ok(columns.includes("synced_models_at"));
  } finally {
    db.close();
  }
});

test("TC-OMNIDB-CATALOG-003B: sync write stamps the connection timestamp", () => {
  const providers = read("src/lib/db/providers.ts");
  const models = read("src/lib/db/models.ts");
  assert.match(providers, /"synced_models_at"/);
  assert.match(providers, /export async function touchConnectionSyncedModelsAt/);
  assert.match(models, /touchConnectionSyncedModelsAt/);
  assert.match(
    models,
    /persistCanonicalSyncedAvailableModels[\s\S]{0,500}touchConnectionSyncedModelsAt\(connectionId\)/
  );
});

test("TC-OMNIDB-CATALOG-004A: stale catalog authority depends on fresh timestamp", () => {
  const source = read("src/lib/db/models/activeSyncedCatalog.ts");
  assert.match(source, /AGENTPROXY_SYNCED_CATALOG_STALE_AFTER_MS/);
  assert.match(source, /synced_models_at/);
  assert.match(source, /hasFreshConnection/);
  assert.match(
    source,
    /authoritative:\s*providerUsesAuthoritativeLiveCatalog\(providerId\)\s*&&\s*hasFreshConnection/
  );
});

test("TC-OMNIDB-CATALOG-004B: migration runner treats 177 as already applied when column exists", () => {
  const source = read("src/lib/db/migrationRunner.ts");
  assert.match(
    source,
    /case "177":[\s\S]{0,250}?hasColumn\(db, "provider_connections", "synced_models_at"\)/
  );
});
