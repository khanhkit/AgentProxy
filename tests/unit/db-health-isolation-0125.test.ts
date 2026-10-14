import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

test("TC-OMNIDB-HEALTH-027A: coordinator preserves skip-integrity job/cache identity", async () => {
  const mod = await import(pathToFileURL(path.join(root, "src/lib/db/healthCheckRunner.ts")).href);
  const calls: Array<{ autoRepair: boolean; skip: boolean }> = [];
  const firstResult = {
    isHealthy: true,
    issues: [],
    repairedCount: 0,
    backupCreated: false,
    autoRepair: false,
    checkedAt: "x",
    driver: { name: "better-sqlite3", degraded: false },
  };
  let resolveFirst: (value: typeof firstResult) => void = () => {};
  const first = new Promise<typeof firstResult>((resolve) => {
    resolveFirst = resolve;
  });
  const coordinator = mod.createDbHealthCoordinator(
    (autoRepair: boolean, skip: boolean) => {
      calls.push({ autoRepair, skip });
      if (calls.length === 1) return first;
      return Promise.resolve({
        isHealthy: true,
        issues: [],
        repairedCount: 0,
        backupCreated: false,
        autoRepair,
        checkedAt: "x",
        driver: { name: "better-sqlite3", degraded: false },
      });
    },
    { now: () => 1000, cacheMs: 60_000 }
  );
  const active = coordinator.run(false, false);
  assert.equal(coordinator.run(false, true), active);
  await assert.rejects(coordinator.run(true, false), /already in progress/);
  resolveFirst(firstResult);
  await active;
  await coordinator.run(false, false);
  assert.equal(calls.length, 1, "full non-repair diagnosis should be cached");

  let skippedCalls = 0;
  const skipped = mod.createDbHealthCoordinator(
    async (autoRepair: boolean, _skip: boolean) => {
      skippedCalls++;
      return {
        isHealthy: true,
        issues: [],
        repairedCount: 0,
        backupCreated: false,
        autoRepair,
        checkedAt: "x",
        driver: { name: "better-sqlite3", degraded: false },
      };
    },
    { now: () => 1000, cacheMs: 60_000 }
  );
  await skipped.run(false, true);
  await skipped.run(false, true);
  assert.equal(skippedCalls, 2, "skipped integrity diagnoses must not populate the cache");
});

test("TC-OMNIDB-HEALTH-027B: child runner validates IPC result and supports cancellation", async () => {
  const mod = await import(pathToFileURL(path.join(root, "src/lib/db/healthCheckRunner.ts")).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-health-worker-"));
  const worker = path.join(dir, "worker.mjs");
  fs.writeFileSync(
    worker,
    `process.once("message",(job)=>{setTimeout(()=>{process.send?.({isHealthy:true,issues:[],repairedCount:0,backupCreated:false,autoRepair:job.autoRepair,checkedAt:"x",driver:{name:"better-sqlite3",degraded:false}},()=>process.disconnect())},5)})`
  );
  const job = {
    filePath: "/tmp/fake.sqlite",
    autoRepair: false,
    skipIntegrityCheck: false,
    backupDir: "/tmp",
    pagerCorruption: null,
  };
  const result = await mod.runDbHealthInChild(job, {
    workerFile: worker,
    execArgv: [],
    timeoutMs: 1000,
  });
  assert.equal(result.isHealthy, true);

  const slow = path.join(dir, "slow.mjs");
  fs.writeFileSync(slow, `process.once("message",()=>setTimeout(()=>{},10000))`);
  const ac = new AbortController();
  const pending = mod.runDbHealthInChild(job, {
    workerFile: slow,
    execArgv: [],
    timeoutMs: 1000,
    signal: ac.signal,
  });
  ac.abort();
  await assert.rejects(pending, /cancelled/);
});

test("TC-OMNIDB-HEALTH-028: health worker uses isolated native connection and backup-before-write lock", () => {
  const source = read("src/lib/db/healthCheckWorker.ts");
  assert.match(source, /readonly:\s*!job\.autoRepair/);
  const repairBlock = source.slice(source.indexOf("if (job.autoRepair && result.issues.length > 0)"));
  const lockIndex = repairBlock.indexOf("connection.immediate(() =>");
  const backupIndex = repairBlock.indexOf('createManagedDbBackup(snapshotConnection, "health-check-repair", job.backupDir)');
  assert.ok(lockIndex >= 0, "repair must acquire the write lock");
  assert.ok(backupIndex > lockIndex, "repair backup must be taken after the write lock is acquired");
  assert.match(
    repairBlock,
    /tryOpenSync\(job\.filePath,[\s\S]{0,180}?readonly:\s*true/
  );
  assert.match(source, /createBackupBeforeRepair:\s*\(\) => true/);
  assert.match(source, /connection\.close\(\)/);
});

test("TC-OMNIDB-HEALTH-029: DB core exposes isolated async health without breaking synchronous public wrapper", () => {
  const core = read("src/lib/db/core.ts");
  const runtime = read("src/lib/db/managedHealthRuntime.ts");
  assert.match(core, /createManagedHealthRuntime/);
  assert.match(core, /export const runIsolatedManagedDbHealthCheck = managedHealth\.runIsolated/);
  assert.match(core, /export const runManagedDbHealthCheck = managedHealth\.runDirect/);
  assert.match(
    core,
    /startDbHealthCheckScheduler[\s\S]{0,1400}?runIsolatedManagedDbHealthCheck\(\{\s*autoRepair: true/
  );
  assert.match(core, /periodicHealthAbort/);
  assert.match(core, /periodicHealthAbort\?\.abort\(\)/);
  assert.match(runtime, /createDbHealthCoordinator/);
  assert.match(runtime, /runDbHealthInChild\(/);
  assert.match(runtime, /runDbHealthCheck\(db,/);
  assert.match(runtime, /createManagedDbBackup\(db, "health-check-repair", backupDir\)/);
  assert.match(runtime, /getPagerCorruption\(\)/);
  assert.match(runtime, /invalidateDbCache\(\)/);
});

test("AP-ISS-0198: isolated repair snapshots the locked pre-repair state", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { tryOpenSync } = await import("../../src/lib/db/adapters/driverFactory.ts");
  const { runDbHealthInChild } = await import("../../src/lib/db/healthCheckRunner.ts");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-health-lock-snapshot-"));
  const filePath = path.join(dir, "health.sqlite");
  const backupDir = path.join(dir, "backups");
  const seed = tryOpenSync(filePath, { timeout: 5000 });
  assert.ok(seed, "native sqlite driver required for isolated health worker test");
  seed.exec("CREATE TABLE db_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  seed.prepare("INSERT INTO db_meta (key, value) VALUES ('schema_version', ?)").run("stale");
  seed.close();

  try {
    const result = await runDbHealthInChild(
      {
        filePath,
        autoRepair: true,
        skipIntegrityCheck: true,
        backupDir,
        pagerCorruption: null,
      },
      { timeoutMs: 30_000 }
    );
    assert.equal(result.backupCreated, true);
    assert.equal(result.repairedCount, 1);

    const live = tryOpenSync(filePath, { fileMustExist: true, readonly: true, timeout: 5000 });
    assert.ok(live);
    const liveVersion = live
      .prepare("SELECT value FROM db_meta WHERE key = 'schema_version'")
      .get() as { value: string };
    live.close();
    assert.equal(liveVersion.value, "1", "live database must contain the repair");

    const backups = fs.readdirSync(backupDir).filter((name) => name.endsWith(".sqlite"));
    assert.equal(backups.length, 1);
    const snapshot = tryOpenSync(path.join(backupDir, backups[0]), {
      fileMustExist: true,
      readonly: true,
      timeout: 5000,
    });
    assert.ok(snapshot);
    const snapshotVersion = snapshot
      .prepare("SELECT value FROM db_meta WHERE key = 'schema_version'")
      .get() as { value: string };
    snapshot.close();
    assert.equal(snapshotVersion.value, "stale", "backup must preserve the exact pre-repair state");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
