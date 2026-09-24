import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = path.join(repoRoot, "src/lib/db/migrations");
const runnerPath = path.join(repoRoot, "src/lib/db/migrationRunner.ts");

const migrations = [
  ["179_proxy_logs_upstream_status.sql", "upstream_status"],
  ["181_proxy_logs_proxy_name.sql", "proxy_name"],
  ["183_proxy_logs_rotation_account.sql", "rotation_account"],
  ["184_proxy_logs_correlation_id.sql", "correlation_id"],
] as const;

test("TC-OMNIDB-MIG-001: proxy-log migrations add all attribution columns", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE proxy_logs (id TEXT PRIMARY KEY)");
    for (const [file] of migrations) {
      db.exec(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
    }
    const columns = db.prepare("PRAGMA table_info(proxy_logs)").all().map((row: any) => row.name);
    for (const [, column] of migrations) assert.ok(columns.includes(column), `missing ${column}`);

    const indexes = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='proxy_logs'")
      .all()
      .map((row: any) => String(row.sql ?? ""))
      .join("\n");
    assert.ok(!indexes.includes("correlation_id"), "correlation join must not add a proxy_logs index");
  } finally {
    db.close();
  }
});

test("TC-OMNIDB-MIG-002: migration runner skips columns already added by boot repair", () => {
  const source = fs.readFileSync(runnerPath, "utf8");
  for (const [version, column] of [
    ["179", "upstream_status"],
    ["181", "proxy_name"],
    ["183", "rotation_account"],
    ["184", "correlation_id"],
  ] as const) {
    const pattern = new RegExp(
      `case ["']${version}["']:[\\s\\S]{0,500}?hasColumn\\(db, ["']proxy_logs["'], ["']${column}["']\\)`
    );
    assert.match(source, pattern, `runner must guard migration ${version} with proxy_logs.${column}`);
  }
});

test("TC-OMNIDB-MIG-003: proxy-log boot repair can add all guarded attribution columns", () => {
  const source = fs.readFileSync(path.join(repoRoot, "src/lib/db/schemaColumns.ts"), "utf8");
  for (const [, column] of migrations) {
    const pattern = new RegExp(
      `if \\(!columnNames\\.has\\(["']${column}["']\\)\\)[\\s\\S]{0,260}?ALTER TABLE proxy_logs ADD COLUMN ${column} `
    );
    assert.match(source, pattern, `boot repair must add proxy_logs.${column}`);
  }
});
