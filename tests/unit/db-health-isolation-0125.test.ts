import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");

test("TC-OMNIDB-HEALTH-027A: coordinator preserves skip-integrity job/cache identity", async()=>{
  const mod=await import(pathToFileURL(path.join(root,"src/lib/db/healthCheckRunner.ts")).href);
  const calls:Array<{autoRepair:boolean;skip:boolean}>=[];
  let resolveFirst:(value:any)=>void=()=>{};
  const first=new Promise((resolve)=>{resolveFirst=resolve;});
  const coordinator=mod.createDbHealthCoordinator(
    (autoRepair:boolean,skip:boolean)=>{
      calls.push({autoRepair,skip});
      if(calls.length===1) return first;
      return Promise.resolve({isHealthy:true,issues:[],repairedCount:0,backupCreated:false,autoRepair,checkedAt:"x",driver:{name:"better-sqlite3",degraded:false}});
    },
    {now:()=>1000,cacheMs:60_000}
  );
  const active=coordinator.run(false,false);
  assert.equal(coordinator.run(false,true),active);
  await assert.rejects(coordinator.run(true,false),/already in progress/);
  resolveFirst({isHealthy:true,issues:[],repairedCount:0,backupCreated:false,autoRepair:false,checkedAt:"x",driver:{name:"better-sqlite3",degraded:false}});
  await active;
  await coordinator.run(false,false);
  assert.equal(calls.length,1,"full non-repair diagnosis should be cached");

  let skippedCalls=0;
  const skipped=mod.createDbHealthCoordinator(async(autoRepair:boolean,skip:boolean)=>{
    skippedCalls++;
    return {isHealthy:true,issues:[],repairedCount:0,backupCreated:false,autoRepair,checkedAt:"x",driver:{name:"better-sqlite3",degraded:false}};
  },{now:()=>1000,cacheMs:60_000});
  await skipped.run(false,true);
  await skipped.run(false,true);
  assert.equal(skippedCalls,2,"skipped integrity diagnoses must not populate the cache");
});

test("TC-OMNIDB-HEALTH-027B: child runner validates IPC result and supports cancellation", async()=>{
  const mod=await import(pathToFileURL(path.join(root,"src/lib/db/healthCheckRunner.ts")).href);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agentproxy-health-worker-"));
  const worker=path.join(dir,"worker.mjs");
  fs.writeFileSync(worker,`process.once("message",(job)=>{setTimeout(()=>{process.send?.({isHealthy:true,issues:[],repairedCount:0,backupCreated:false,autoRepair:job.autoRepair,checkedAt:"x",driver:{name:"better-sqlite3",degraded:false}},()=>process.disconnect())},5)})`);
  const job={filePath:"/tmp/fake.sqlite",autoRepair:false,skipIntegrityCheck:false,backupDir:"/tmp",pagerCorruption:null};
  const result=await mod.runDbHealthInChild(job,{workerFile:worker,execArgv:[],timeoutMs:1000});
  assert.equal(result.isHealthy,true);

  const slow=path.join(dir,"slow.mjs");
  fs.writeFileSync(slow,`process.once("message",()=>setTimeout(()=>{},10000))`);
  const ac=new AbortController();
  const pending=mod.runDbHealthInChild(job,{workerFile:slow,execArgv:[],timeoutMs:1000,signal:ac.signal});
  ac.abort();
  await assert.rejects(pending,/cancelled/);
});

test("TC-OMNIDB-HEALTH-028: health worker uses isolated native connection and backup-before-write lock",()=>{
  const source=read("src/lib/db/healthCheckWorker.ts");
  assert.match(source,/readonly:\s*!job\.autoRepair/);
  assert.match(source,/createManagedDbBackup\(connection, "health-check-repair", job\.backupDir\)/);
  assert.match(source,/connection\.immediate\(\(\) =>/);
  assert.match(source,/createBackupBeforeRepair:\s*\(\) => true/);
  assert.match(source,/connection\.close\(\)/);
});

test("TC-OMNIDB-HEALTH-029: DB core exposes isolated async health without breaking synchronous public wrapper",()=>{
  const core=read("src/lib/db/core.ts");
  assert.match(core,/createDbHealthCoordinator, runDbHealthInChild/);
  assert.match(core,/export function runIsolatedManagedDbHealthCheck/);
  assert.match(core,/runDbHealthInChild\(/);
  assert.match(core,/startDbHealthCheckScheduler[\s\S]{0,1400}?runIsolatedManagedDbHealthCheck\(\{\s*autoRepair: true/);
  assert.match(core,/export function runManagedDbHealthCheck[\s\S]{0,520}?return runDbHealthCheck\(db,/);
  assert.match(core,/periodicHealthAbort/);
  assert.match(core,/periodicHealthAbort\?\.abort\(\)/);
});
