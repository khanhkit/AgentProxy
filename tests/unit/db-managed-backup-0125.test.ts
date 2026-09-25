import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");

test("TC-OMNIDB-BACKUP-026A: managed backup isolates sql.js snapshot ownership",()=>{
  const source=read("src/lib/db/managedBackup.ts");
  assert.match(source,/db\.driver === "sql\.js"/);
  assert.match(source,/new Database\(new Uint8Array\(\)\)/);
  assert.match(source,/owner\.run\("VACUUM main INTO \?", \[filename\]\)/);
  assert.match(source,/fs\.openSync\(backupPath, "wx", 0o600\)/);
  assert.match(source,/fs\.fsyncSync\(fd\)/);
  assert.match(source,/snapshot\.close\(\)/);
});

test("TC-OMNIDB-BACKUP-026B: managed backup uses AgentProxy persisted retention resolver",()=>{
  const source=read("src/lib/db/managedBackup.ts");
  assert.match(source,/resolveDbBackupRetention\(db\)/);
  assert.match(source,/pruneBackupDirectory\(\{ backupDir, \.\.\.resolveDbBackupRetention\(db\) \}\)/);
});

test("TC-OMNIDB-BACKUP-026C: core delegates managed backup implementation",()=>{
  const core=read("src/lib/db/core.ts");
  assert.match(core,/createManagedDbBackup as writeManagedDbBackup/);
  assert.match(core,/return writeManagedDbBackup\(db, reason, backupDir\)/);
});
