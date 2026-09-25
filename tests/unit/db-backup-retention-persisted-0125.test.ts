import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

test("TC-OMNIDB-BACKUP-014A: resolver honors env -> persisted -> default precedence", async () => {
  const mod = await import("../../src/lib/db/backupRetention.ts");
  assert.equal(typeof mod.resolveDbBackupRetention, "function");

  const persisted = new Map([
    ["maxFiles", "3"],
    ["retentionDays", "7"],
  ]);
  const db = {
    prepare() {
      return {
        get(_namespace: string, key: string) {
          const value = persisted.get(key);
          return value === undefined ? undefined : { value };
        },
      };
    },
  };

  assert.deepEqual(mod.resolveDbBackupRetention(db, {}), {
    maxFiles: 3,
    retentionDays: 7,
  });
  assert.deepEqual(
    mod.resolveDbBackupRetention(db, {
      DB_BACKUP_MAX_FILES: "5",
      DB_BACKUP_RETENTION_DAYS: "14",
    }),
    { maxFiles: 5, retentionDays: 14 }
  );

  const emptyDb = { prepare: () => ({ get: () => undefined }) };
  assert.deepEqual(mod.resolveDbBackupRetention(emptyDb, {}), {
    maxFiles: 20,
    retentionDays: 0,
  });
});

test("TC-OMNIDB-BACKUP-014B: all backup paths share the same retention resolver", () => {
  const backup = read("src/lib/db/backup.ts");
  const managedBackup = read("src/lib/db/managedBackup.ts");

  assert.match(backup, /resolveDbBackupRetention\(getDbInstance\(\)\)\.maxFiles/);
  assert.match(backup, /resolveDbBackupRetention\(getDbInstance\(\)\)\.retentionDays/);

  assert.match(managedBackup, /resolveDbBackupRetention\(db\)/);
  assert.match(
    managedBackup,
    /pruneBackupDirectory\(\{ backupDir, \.\.\.resolveDbBackupRetention\(db\) \}\)/
  );
});
