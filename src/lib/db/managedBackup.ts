import fs from "node:fs";
import path from "node:path";

import type { SqliteAdapter } from "./adapters/types";
import { pruneBackupDirectory, resolveDbBackupRetention } from "./backupRetention";

interface SqlJsSnapshotDatabase {
  export(): Uint8Array;
}

function exportSqlJsSnapshot(owner: SqlJsSnapshotDatabase): Uint8Array {
  return owner.export();
}

function sanitizeBackupReason(reason: string): string {
  return (
    reason
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .slice(0, 64) || "backup"
  );
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
    const safeReason = sanitizeBackupReason(reason);
    const backupPath = path.join(backupDir, `db_${timestamp}_${safeReason}.sqlite`);
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
