import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");

test("TC-OMNIDB-AUTOVAC-019A: startup detects and persists configured-vs-live auto_vacuum drift",()=>{
  const source=read("src/lib/db/optimizationSettings.ts");
  assert.match(source,/export interface AutoVacuumDrift/);
  assert.match(source,/export function checkAutoVacuumDrift/);
  assert.match(source,/persistAutoVacuumDriftRecord/);
  assert.match(source,/applyStoredDatabaseOptimizationSettings[\s\S]{0,1000}?checkAutoVacuumDrift\(db, settings\)/);
  assert.match(source,/applyStoredDatabaseOptimizationSettings[\s\S]{0,1400}?persistAutoVacuumDriftRecord\(db, drift\)/);
});

test("TC-OMNIDB-AUTOVAC-019B: vacuum scheduler reconciles drift or performs bounded incremental reclaim",()=>{
  const source=read("src/lib/db/vacuumScheduler.ts");
  assert.match(source,/autoVacuumDrift:\s*AutoVacuumDrift \| null/);
  assert.match(source,/lastReclaimedPages:\s*number \| null/);
  assert.match(source,/function runBoundedIncrementalVacuum/);
  assert.match(source,/incremental_vacuum\(\$\{INCREMENTAL_VACUUM_BATCH_PAGES\}\)/);
  assert.match(source,/const drift = loadAutoVacuumDrift\(\)/);
  assert.match(source,/setAutoVacuumForDb\(db, drift\.configured\)/);
  assert.match(source,/clearAutoVacuumDrift\(\)/);
  assert.match(source,/getAutoVacuumModeForDb\(db\) === "INCREMENTAL"/);
});

test("TC-OMNIDB-AUTOVAC-020: database settings expose pending drift and reclaimed pages",()=>{
  const dbSettings=read("src/lib/db/databaseSettings.ts");
  const types=read("src/types/databaseSettings.ts");
  assert.match(dbSettings,/autoVacuumDrift:\s*vacuumState\.autoVacuumDrift/);
  assert.match(dbSettings,/lastReclaimedPages:\s*vacuumState\.lastReclaimedPages/);
  assert.match(types,/autoVacuumDrift:\s*\{ configured: string; live: string \} \| null/);
  assert.match(types,/lastReclaimedPages:\s*number \| null/);
});
