import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"../..");
const source=fs.readFileSync(path.join(root,"src/lib/db/healthCheck.ts"),"utf8");

test("TC-OMNIDB-HEALTH-025A: repair backup is fail-closed and occurs before mutations",()=>{
  assert.match(source,/backupCreated = options\.createBackupBeforeRepair\(\);[\s\S]{0,180}?if \(!backupCreated\)[\s\S]{0,180}?throw new Error\("Database health repair aborted: backup creation failed\."\)/);
  assert.match(source,/repairComboRows[\s\S]{0,320}?beforeRepair:\s*\(\) => void/);
  assert.match(source,/options\.beforeRepair\(\);[\s\S]{0,160}?updateComboStmt\.run/);
});

test("TC-OMNIDB-HEALTH-025B: quota snapshot health scan is bounded and keyset-paginated",()=>{
  assert.match(source,/const QUOTA_SNAPSHOT_PAGE_SIZE = 1000/);
  assert.match(source,/function scanQuotaSnapshots/);
  assert.match(source,/ORDER BY quota_snapshots\.id DESC LIMIT 1/);
  assert.match(source,/ORDER BY quota_snapshots\.id LIMIT \?/);
  assert.match(source,/nextPage\.all\(lastId, upper\.id, QUOTA_SNAPSHOT_PAGE_SIZE\)/);
  assert.doesNotMatch(source,/SELECT id, provider, connection_id, created_at FROM quota_snapshots/);
});

test("TC-OMNIDB-HEALTH-025C: provider existence lookup is prepared once per repair/scan",()=>{
  assert.match(source,/function hasProviderConnection\(statement: PreparedStatement, connectionId: string\)/);
  assert.match(source,/const connectionStmt = db\.prepare\([\s\S]{0,140}?SELECT 1 AS ok FROM provider_connections WHERE id = \? LIMIT 1/);
  assert.match(source,/hasProviderConnection\(connectionStmt, connectionId\)/);
});
