import { tryOpenSync } from "./adapters/driverFactory";
import { runDbHealthCheck, notePagerCorruption } from "./healthCheck";
import { createManagedDbBackup } from "./managedBackup";
import type { DbHealthJob } from "./healthCheckRunner";

process.once("message", (job: DbHealthJob) => {
  let db: ReturnType<typeof tryOpenSync> = null;
  try {
    db = tryOpenSync(job.filePath, {
      fileMustExist: true,
      readonly: !job.autoRepair,
      timeout: 5000,
    });
    if (!db) throw new Error("Native database driver unavailable");
    if (job.pagerCorruption)
      notePagerCorruption(job.pagerCorruption.source, job.pagerCorruption.message);
    const connection = db;
    const options = {
      skipIntegrityCheck: job.skipIntegrityCheck,
      expectedSchemaVersion: "1",
    };
    let result = runDbHealthCheck(connection, { ...options, autoRepair: false });
    if (job.autoRepair && result.issues.length > 0) {
      // VACUUM INTO cannot run on the writer's active transaction. Hold the
      // writer lock first, then snapshot through a separate read-only
      // connection so no other writer can commit between backup and repair.
      connection.immediate(() => {
        const snapshotConnection = tryOpenSync(job.filePath, {
          fileMustExist: true,
          readonly: true,
          timeout: 5000,
        });
        if (!snapshotConnection) {
          throw new Error("Native database driver unavailable for health-check backup");
        }
        try {
          if (!createManagedDbBackup(snapshotConnection, "health-check-repair", job.backupDir)) {
            throw new Error("Database health repair backup failed");
          }
        } finally {
          snapshotConnection.close();
        }
        result = runDbHealthCheck(connection, {
          ...options,
          autoRepair: true,
          createBackupBeforeRepair: () => true,
        });
      });
      result.backupCreated = true;
    }
    result.autoRepair = job.autoRepair;
    connection.close();
    db = null;
    process.send?.(result, () => {
      process.disconnect();
    });
  } catch {
    try {
      db?.close();
    } catch {
      /* Preserve the diagnostic failure. */
    }
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  }
});
