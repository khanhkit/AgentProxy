import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");
const core=read("src/lib/db/core.ts");
const columns=read("src/lib/db/schemaColumns.ts");

test("TC-OMNIDB-BOOT-030: request/provider index is created only after legacy call-log column healing",()=>{
  assert.doesNotMatch(core,/CREATE INDEX IF NOT EXISTS idx_cl_request_provider/);
  assert.match(columns,/ensureCallLogsColumns[\s\S]{0,7600}?CREATE INDEX IF NOT EXISTS idx_cl_request_provider ON call_logs\(request_type, provider\)/);
  const heal=columns.indexOf('ALTER TABLE call_logs ADD COLUMN request_type TEXT DEFAULT NULL');
  const index=columns.indexOf('CREATE INDEX IF NOT EXISTS idx_cl_request_provider');
  assert.ok(heal>=0 && index>heal,"index must be created after request_type healing");
});

test("TC-OMNIDB-BOOT-031A: readonly probe is closed on success, catch, and finally paths",()=>{
  assert.match(core,/let probe: SqliteDatabase \| null = null;[\s\S]{0,120}?try \{[\s\S]{0,120}?probe = openSqliteDatabase\(sqliteFile, \{ readonly: true \}\)/);
  assert.match(core,/catch \(e: unknown\) \{[\s\S]{0,180}?closeProbeIfSafe\(probe\)/);
  assert.match(core,/finally \{[\s\S]{0,180}?closeProbeIfSafe\(probe\)/);
});

test("TC-OMNIDB-BOOT-031B: primary DB initialization closes failed connection",()=>{
  assert.match(core,/const db = openSqliteDatabase\(sqliteFile\);\s*try \{/);
  assert.match(core,/catch \(error\) \{[\s\S]{0,520}?closeProbeIfSafe\(db\)/);
});
