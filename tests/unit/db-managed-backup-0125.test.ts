import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");

test("TC-OMNIDB-BACKUP-026A / AP-ISS-0198 4233378331: sql.js backup exports the live owner image",()=>{
  const source=read("src/lib/db/managedBackup.ts");
  assert.match(source,/db\.driver === "sql\.js"/);
  assert.match(source,/owner\.export\(\)/);
  assert.doesNotMatch(source,/new Database\(new Uint8Array\(\)\)/);
  assert.match(source,/fs\.openSync\(backupPath, "wx", 0o600\)/);
  assert.match(source,/fs\.fsyncSync\(fd\)/);
});

test("AP-ISS-0198 4233378732: managed backup reason cannot escape the backup directory",()=>{
  const source=read("src/lib/db/managedBackup.ts");
  assert.match(source,/sanitizeBackupReason/);
  assert.match(source,/path\.join\(backupDir, `db_\$\{timestamp\}_\$\{safeReason\}\.sqlite`\)/);
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
