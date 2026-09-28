import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fallbacks = fs.readFileSync(path.join(root, "src/lib/db/apiKeyColumnFallbacks.ts"), "utf8");
const parsers = fs.readFileSync(path.join(root, "src/lib/db/apiKeys/rowParsers.ts"), "utf8");
const updates = fs.readFileSync(path.join(root, "src/lib/db/apiKeys/permissionsUpdate.ts"), "utf8");
const mutation = fs.readFileSync(path.join(root, "src/lib/db/apiKeys/permissionsMutation.ts"), "utf8");
const apiKeys = fs.readFileSync(path.join(root, "src/lib/db/apiKeys.ts"), "utf8");

test("TC-OMNIDB-KEY-051A: api key schema fallback carries auto-combo and catalog-scope defaults", () => {
  assert.match(fallbacks, /name: "allow_auto_combos"/);
  assert.match(fallbacks, /allow_auto_combos INTEGER NOT NULL DEFAULT 1/);
  assert.match(fallbacks, /name: "catalog_scope"/);
  assert.match(fallbacks, /catalog_scope TEXT NOT NULL DEFAULT 'all'/);
});

test("TC-OMNIDB-KEY-051B: row parsers preserve backward-compatible widening defaults", () => {
  assert.match(parsers, /export function parseAllowAutoCombos/);
  assert.match(parsers, /value === 0 \|\| value === "0" \|\| value === false/);
  assert.match(parsers, /export type CatalogScope = "all" \| "combos" \| "models"/);
  assert.match(parsers, /return value === "combos" \|\| value === "models" \? value : "all"/);
});

test("TC-OMNIDB-KEY-051C: permissions update persists both fields and invalidates catalog visibility", () => {
  assert.match(updates, /allowAutoCombos\?: boolean/);
  assert.match(updates, /catalogScope\?: "all" \| "combos" \| "models"/);
  assert.match(updates, /allowAutoCombos: update\.allowAutoCombos/);
  assert.match(updates, /catalogScope: update\.catalogScope/);

  assert.match(mutation, /normalized\.allowAutoCombos !== undefined/);
  assert.match(mutation, /normalized\.catalogScope !== undefined/);
  assert.match(mutation, /updates\.push\("allow_auto_combos = @allowAutoCombos"\)/);
  assert.match(mutation, /updates\.push\("catalog_scope = @catalogScope"\)/);
  assert.match(mutation, /if \(shouldInvalidateModelCatalog\) invalidateModelCatalogCache\(\)/);
});

test("TC-OMNIDB-KEY-051D: API-key list/by-id/metadata read back policy with safe defaults", () => {
  assert.match(apiKeys, /parseAllowAutoCombos/);
  assert.match(apiKeys, /parseCatalogScope/);
  assert.match(apiKeys, /allow_auto_combos, catalog_scope, proxy_id FROM api_keys/);
  assert.ok((apiKeys.match(/camelRow\.allowAutoCombos = parseAllowAutoCombos/g) ?? []).length >= 2);
  assert.ok((apiKeys.match(/camelRow\.catalogScope = parseCatalogScope/g) ?? []).length >= 2);
  assert.match(apiKeys, /allowAutoCombos: true/);
  assert.match(apiKeys, /catalogScope: "all"/);
  assert.match(apiKeys, /allowAutoCombos: parseAllowAutoCombos/);
  assert.match(apiKeys, /catalogScope: parseCatalogScope/);
});
