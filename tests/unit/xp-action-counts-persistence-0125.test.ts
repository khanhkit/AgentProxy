import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

test("TC-OMNIDB-XP-010A: migration 176 backfills durable action counters", () => {
  const sql = read("src/lib/db/migrations/176_xp_action_counts.sql");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE xp_audit_log (
        api_key_id TEXT NOT NULL,
        action TEXT NOT NULL,
        metadata TEXT
      );
      INSERT INTO xp_audit_log(api_key_id, action, metadata) VALUES
        ('k1','request',NULL),
        ('k1','request',NULL),
        ('k1','token_share','{"amount":5}');
    `);
    db.exec(sql);
    const request = db
      .prepare("SELECT count FROM xp_action_counts WHERE api_key_id='k1' AND action='request'")
      .get() as { count: number };
    const share = db
      .prepare("SELECT count FROM xp_action_counts WHERE api_key_id='k1' AND action='token_share'")
      .get() as { count: number };
    assert.equal(request.count, 2);
    assert.equal(share.count, 5);
  } finally {
    db.close();
  }
});

test("TC-OMNIDB-XP-010B: addXp maintains the durable counter alongside the audit log", () => {
  const source = read("src/lib/db/gamification.ts");
  assert.match(source, /INSERT INTO xp_action_counts/);
  assert.match(source, /ON CONFLICT\(api_key_id, action\)/);
  assert.match(source, /count = count \+ excluded\.count/);
  assert.match(source, /json_extract\(\?, '\$\.amount'\)/);
});
