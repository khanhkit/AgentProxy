import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

test("TC-OMNIDB-CPA-013A: migration 185 adds nullable opaque auth index", () => {
  const sql = read("src/lib/db/migrations/185_usage_history_cpa_auth_index.sql");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE usage_history (id INTEGER PRIMARY KEY)");
    db.exec(sql);
    const cols = db.prepare("PRAGMA table_info(usage_history)").all() as Array<Record<string, unknown>>;
    const column = cols.find((c) => c.name === "cpa_auth_index");
    assert.ok(column, "cpa_auth_index column must exist");
    assert.equal(column.notnull, 0, "missing attribution must remain nullable");
  } finally {
    db.close();
  }
});

test("TC-OMNIDB-CPA-013B: usageHistory persists and reads cpaAuthIndex without label coupling", () => {
  const source = read("src/lib/usage/usageHistory.ts");

  assert.match(source, /cpaAuthIndex\?:\s*string\s*\|\s*null/);
  assert.match(source, /SELECT id, endpoint, cpa_auth_index FROM usage_history/);
  assert.match(
    source,
    /if \(!existing\.cpa_auth_index && entry\.cpaAuthIndex\)[\s\S]{0,220}?UPDATE usage_history SET cpa_auth_index = \? WHERE id = \?/
  );
  assert.match(
    source,
    /INSERT INTO usage_history[\s\S]{0,650}?cpa_auth_index/
  );
  assert.match(source, /entry\.cpaAuthIndex \|\| null/);

  const reads = [...source.matchAll(/cpaAuthIndex:\s*toStringOrNull\(r\.cpa_auth_index\)/g)];
  assert.ok(reads.length >= 2, "both getUsageDb and getUsageHistory should expose cpaAuthIndex");
  assert.doesNotMatch(source, /attachCpaAccountLabels|labelForCliproxyAuthIndex/);
});
