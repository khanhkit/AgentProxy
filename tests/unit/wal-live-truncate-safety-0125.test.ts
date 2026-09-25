import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/db/walMaintenance.ts"), "utf8");
const core = fs.readFileSync(path.join(root, "src/lib/db/core.ts"), "utf8");

test("TC-OMNIDB-WAL-021A: runtime WAL scheduler has no periodic TRUNCATE timer", () => {
  assert.doesNotMatch(source, /let walTimer:/);
  assert.doesNotMatch(source, /getWalMaintenanceIntervalMs/);
  const start = source.slice(source.indexOf("export function startWalMaintenance"));
  assert.doesNotMatch(start, /runCheckpointNow\(db, "TRUNCATE"/);
  assert.match(start, /startWalPassiveScheduler\(db, sqliteFile, env\)/);
});

test("TC-OMNIDB-WAL-021B: WAL size guard uses RESTART, not live TRUNCATE", () => {
  const passive = source.slice(source.indexOf("function startWalPassiveScheduler"));
  assert.match(passive, /runCheckpointNow\(db, "RESTART"/);
  assert.doesNotMatch(passive, /runCheckpointNow\(db, "TRUNCATE"/);
  assert.match(source, /wal_checkpoint\(TRUNCATE\).*shutdown|shutdown.*TRUNCATE/is);
});

test("TC-OMNIDB-WAL-022: core documents runtime PASSIVE safety and shutdown TRUNCATE", () => {
  assert.match(core, /WAL maintenance[\s\S]{0,180}?PASSIVE\/RESTART/i);
  assert.match(core, /TRUNCATE[\s\S]{0,220}?shutdown|shutdown[\s\S]{0,220}?TRUNCATE/i);
});

test("TC-OMNIDB-WAL-023: busy checkpoint telemetry survives restart without hot-path writes", () => {
  assert.match(source, /WAL_BUSY_NAMESPACE\s*=\s*"walMaintenance"/);
  assert.match(source, /let pendingBusyDelta\s*=\s*0/);
  assert.match(source, /export function flushBusyTotal/);
  assert.match(
    source,
    /ON CONFLICT\(namespace, key\) DO UPDATE SET value = CAST\(value AS INTEGER\) \+ excluded\.value/
  );
  assert.match(source, /export function loadPersistedBusyTotal/);
  assert.match(source, /mergeBusyTotal\(priorBusyTotal, loadPersistedBusyTotal\(db\)\)/);
});
