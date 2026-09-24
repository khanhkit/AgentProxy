import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

function createDbFromMigration(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(read("src/lib/db/migrations/182_request_cost_ledger_and_key_quota.sql"));
  return db;
}

test("TC-OMNIDB-QUOTA-008A: migration 182 creates ledger/quota tables and indexes", () => {
  const db = createDbFromMigration();
  try {
    const objects = db
      .prepare("SELECT type, name FROM sqlite_master WHERE type IN ('table','index')")
      .all()
      .map((r: any) => String(r.name));
    for (const name of [
      "request_cost_ledger",
      "api_key_quota_limits",
      "api_key_quota_counters",
      "idx_rcl_api_key_timestamp",
      "idx_rcl_timestamp",
      "idx_akqc_dim_bucket",
      "idx_akqc_updated_at",
    ]) {
      assert.ok(objects.includes(name), `missing ${name}`);
    }
  } finally {
    db.close();
  }
});

test("TC-OMNIDB-QUOTA-008B: cost ledger supports traceable monthly successful-spend aggregation", () => {
  const db = createDbFromMigration();
  try {
    const insert = db.prepare(
      `INSERT INTO request_cost_ledger
       (api_key_id, provider, model, amount_usd, success, timestamp, request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run("k1", "openai", "gpt", 1.25, 1, "2026-09-01T00:00:00.000Z", "r1");
    insert.run("k1", "openai", "gpt", 2.75, 1, "2026-09-14T00:00:00.000Z", "r2");
    insert.run("k1", "openai", "gpt", 99, 0, "2026-09-14T01:00:00.000Z", "r3");
    insert.run("k1", "openai", "gpt", 100, 1, "2026-08-31T23:59:59.000Z", "r4");
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(amount_usd),0) amount, COUNT(*) count
         FROM request_cost_ledger
         WHERE api_key_id = ? AND timestamp >= ? AND success = 1`
      )
      .get("k1", "2026-09-01T00:00:00.000Z") as { amount: number; count: number };
    assert.equal(row.amount, 4);
    assert.equal(row.count, 2);
  } finally {
    db.close();
  }
});

test("TC-OMNIDB-QUOTA-009A: key quota limits preserve NULL-as-unlimited and atomic counters", () => {
  const db = createDbFromMigration();
  try {
    db.prepare(
      `INSERT INTO api_key_quota_limits
       (api_key_id, tpm_limit, rpm_limit, monthly_amount_usd)
       VALUES (?, ?, ?, ?)`
    ).run("k1", null, 60, null);
    const limits = db
      .prepare("SELECT tpm_limit tpm, rpm_limit rpm, monthly_amount_usd monthly FROM api_key_quota_limits WHERE api_key_id = ?")
      .get("k1") as { tpm: number | null; rpm: number | null; monthly: number | null };
    assert.equal(limits.tpm, null);
    assert.equal(limits.rpm, 60);
    assert.equal(limits.monthly, null);

    const upsert = db.prepare(
      `INSERT INTO api_key_quota_counters
       (api_key_id, dimension_key, bucket_index, consumed, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(api_key_id, dimension_key, bucket_index) DO UPDATE SET
         consumed = consumed + excluded.consumed,
         updated_at = excluded.updated_at`
    );
    upsert.run("k1", "key-quota:rpm", 10, 1, 1000);
    upsert.run("k1", "key-quota:rpm", 10, 2, 2000);
    const counter = db
      .prepare("SELECT consumed, updated_at FROM api_key_quota_counters WHERE api_key_id=?")
      .get("k1") as { consumed: number; updated_at: number };
    assert.equal(counter.consumed, 3);
    assert.equal(counter.updated_at, 2000);
  } finally {
    db.close();
  }
});

test("TC-OMNIDB-QUOTA-009B: DB repositories expose the persistence contract without runtime wiring", () => {
  const ledger = read("src/lib/db/costLedger.ts");
  const quota = read("src/lib/db/keyQuota.ts");

  for (const fn of [
    "recordLedgerEntry",
    "recordLedgerEntrySafe",
    "recordLedgerEntries",
    "aggregateLedger",
    "listLedgerEntries",
    "aggregateLedgerThisMonth",
  ]) {
    assert.match(ledger, new RegExp(`export function ${fn}\\b`), `missing cost ledger API ${fn}`);
  }

  for (const fn of [
    "getKeyQuotaLimits",
    "upsertKeyQuotaLimits",
    "clearKeyQuotaLimits",
    "incrementKeyQuotaCounter",
    "recordKeyQuotaUsage",
    "getKeyQuotaCounters",
    "getKeyQuotaStatus",
  ]) {
    assert.match(quota, new RegExp(`export function ${fn}\\b`), `missing quota API ${fn}`);
  }

  assert.match(quota, /aggregateLedgerThisMonth/);
  assert.match(quota, /KEY_QUOTA_WINDOW_MS\s*=\s*60_000/);
});
