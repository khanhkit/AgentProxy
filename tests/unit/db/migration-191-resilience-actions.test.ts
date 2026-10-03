// Migration 191 is an additive call_logs column migration. Test the SQL contract
// directly so this child does not add a dependency on legacy migration-dir env names.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const migrationPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src/lib/db/migrations/191_call_logs_resilience_actions.sql"
);
const migrationSql = fs.readFileSync(migrationPath, "utf8");

function columns(db: Database.Database): string[] {
  return (db.prepare("PRAGMA table_info(call_logs)").all() as Array<{ name: string }>).map(
    (column) => column.name
  );
}

test("migration 191 adds call_logs.resilience_actions to the prior schema", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE call_logs (id TEXT PRIMARY KEY, status INTEGER);");
    db.exec(migrationSql);
    assert.ok(columns(db).includes("resilience_actions"));
  } finally {
    db.close();
  }
});

test("migration 191 stays a narrow additive call_logs migration", () => {
  assert.match(migrationSql, /ALTER TABLE\s+call_logs\s+ADD COLUMN\s+resilience_actions\s+TEXT/i);
  assert.doesNotMatch(migrationSql, /DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+/i);
});
