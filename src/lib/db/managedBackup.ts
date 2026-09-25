import fs from "node:fs";
import path from "node:path";

import type { SqliteAdapter } from "./adapters/types";
import { pruneBackupDirectory, resolveDbBackupRetention } from "./backupRetention";

interface SqlJsSnapshotDatabase {
  constructor: unknown;
  exec(sql: string): Array<{ values: unknown[][] }>;
  run(sql: string, params: string[]): void;
  export(): Uint8Array;
  close(): void;
}

type SqlJsSnapshotConstructor = new (data: Uint8Array) => SqlJsSnapshotDatabase;

function exportSqlJsSnapshot(owner: SqlJsSnapshotDatabase): Uint8Array {
  const Database = owner.constructor as SqlJsSnapshotConstructor;
  const snapshot = new Database(new Uint8Array());
  let image: Uint8Array;
  try {
    const filename = snapshot
      .exec("PRAGMA database_list")[0]
      ?.values.find((row) => row[1] === "main")?.[2];
    if (typeof filename !== "string" || !filename) {
      throw new Error("Missing sql.js snapshot filename");
    }
    owner.run("VACUUM main INTO ?", [filename]);
    image = snapshot.export();
  } finally {
    snapshot.close();
  }
  return image;
}

export function createManagedDbBackup(
  db: SqliteAdapter,
  reason: string,
  backupDir: string
): boolean {
  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `db_${timestamp}_${reason}.sqlite`);
    const escapedBackupPath = backupPath.replace(/'/g, "''");

    if (db.driver === "sql.js") {
      const image = exportSqlJsSnapshot(db.raw as SqlJsSnapshotDatabase);
      const fd = fs.openSync(backupPath, "wx", 0o600);
      try {
        fs.writeFileSync(fd, image);
        fs.fsyncSync(fd);
      } catch (error) {
        try {
          fs.unlinkSync(backupPath);
        } catch {
          // Preserve the original write failure.
        }
        throw error;
      } finally {
        fs.closeSync(fd);
      }
    } else {
      db.exec(`VACUUM INTO '${escapedBackupPath}'`);
    }

    console.log(`[DB] Backup created (${reason}): ${backupPath}`);

    try {
      pruneBackupDirectory({ backupDir, ...resolveDbBackupRetention(db) });
    } catch {
      // Retention is best-effort; never hide a successful safety backup.
    }

    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[DB] Failed to create ${reason} backup:`, message);
    return false;
  }
}
