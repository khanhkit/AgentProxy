import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/db/modelIntelligence.ts"), "utf8");

test("TC-OMNIDB-ELO-041A: repository exposes source freshness lookup", () => {
  assert.match(source, /export function getLatestSyncedAt\(source: string\): string \| null/);
  assert.match(source, /SELECT MAX\(synced_at\) as latest FROM model_intelligence WHERE source = \?/);
});

test("TC-OMNIDB-ELO-041B: Arena refresh upsert and membership prune share one transaction", () => {
  assert.match(source, /export function applyArenaEloRefresh/);
  assert.match(source, /const refresh = db\.transaction\(\(\) => \{/);
  assert.match(source, /INSERT OR REPLACE INTO model_intelligence/);
  assert.match(source, /DELETE FROM model_intelligence[\s\S]{0,180}?WHERE source = \?/);
  assert.match(source, /json_each\(\?\)/);
  assert.match(source, /return refresh\(\)/);
});

test("TC-OMNIDB-ELO-041C: membership uses composite model-category keys", () => {
  assert.match(source, /entries\.map\(\(e\) => `\$\{e\.model\}\\u0000\$\{e\.category\}`\)/);
  assert.match(source, /model \|\| char\(0\) \|\| category/);
});
