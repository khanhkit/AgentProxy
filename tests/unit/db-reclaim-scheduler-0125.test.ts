import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");

test("TC-OMNIDB-RECLAIM-017A: cleanup scheduler delegates bounded page reclaim, never inline full VACUUM",()=>{
  const cleanup=read("src/lib/db/cleanup.ts");
  assert.match(cleanup,/from "\.\/reclaimFreedPages"/);
  assert.match(cleanup,/export async function runScheduledCleanupPass/);
  assert.match(cleanup,/await reclaimFreedPages\(\)/);
  const scheduler=cleanup.slice(cleanup.indexOf("// ──────────────── Background Cleanup Scheduler"));
  assert.doesNotMatch(scheduler,/\.exec\(["'`]VACUUM["'`]\)/);
  assert.doesNotMatch(scheduler,/const proxyResult = await cleanupProxyLogs\(\)/);
});

test("TC-OMNIDB-RECLAIM-017B: incremental reclaim is bounded and checkpoints live WAL PASSIVE-only",()=>{
  const source=read("src/lib/db/reclaimFreedPages.ts");
  assert.match(source,/PRAGMA incremental_vacuum\(\$\{batchPages\}\)/);
  assert.match(source,/INCREMENTAL_VACUUM_MAX_BATCHES\s*=\s*2048/);
  assert.match(source,/INCREMENTAL_VACUUM_TIME_BUDGET_MS\s*=\s*30_000/);
  assert.match(source,/checkpointQuietly\(db, "PASSIVE"\)/);
  assert.doesNotMatch(source,/checkpointQuietly\(db, "TRUNCATE"\)/);
  assert.match(source,/requestFullVacuum\(/);
});

test("TC-OMNIDB-RECLAIM-018: deferred full-vacuum request is persisted and cleared after success",()=>{
  const source=read("src/lib/db/vacuumScheduler.ts");
  assert.match(source,/fullVacuumRequestedAt:\s*number \| null/);
  assert.match(source,/fullVacuumRequestReason:\s*string \| null/);
  assert.match(source,/export function requestFullVacuum\(reason: string\)/);
  assert.match(source,/hydrateFromPersistedState\(\)/);
  assert.match(source,/currentState\.fullVacuumRequestedAt = null/);
  assert.match(source,/currentState\.fullVacuumRequestReason = null/);
});
