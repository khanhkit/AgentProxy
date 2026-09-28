import type { SqliteAdapter } from "./adapters/types";
import { getPagerCorruption, runDbHealthCheck, type DbHealthCheckResult } from "./healthCheck";
import { createDbHealthCoordinator, runDbHealthInChild } from "./healthCheckRunner";
import { createManagedDbBackup } from "./managedBackup";
import { invalidateDbCache } from "./readCache";

export type ManagedHealthCheckOptions = {
  autoRepair?: boolean;
  skipIntegrityCheck?: boolean;
};

type ManagedHealthRuntimeDeps = {
  getDb: () => SqliteAdapter;
  getBackupDir: () => string;
  getSignal: () => AbortSignal | undefined;
  createDirectBackup: (db: SqliteAdapter) => boolean;
};

export function createManagedHealthRuntime(deps: ManagedHealthRuntimeDeps) {
  const coordinator = createDbHealthCoordinator(async (autoRepair, skipIntegrity) => {
    const db = deps.getDb();
    const skipIntegrityCheck = skipIntegrity || process.env.AGENTPROXY_SKIP_DB_HEALTHCHECK === "1";
    const backupDir = deps.getBackupDir();

    const runDirect = () =>
      runDbHealthCheck(db, {
        autoRepair,
        skipIntegrityCheck,
        expectedSchemaVersion: "1",
        createBackupBeforeRepair: () => createManagedDbBackup(db, "health-check-repair", backupDir),
      });

    let result: DbHealthCheckResult;
    if (db.driver === "sql.js" || db.name === ":memory:" || !db.name) {
      result = runDirect();
    } else {
      try {
        result = await runDbHealthInChild(
          {
            filePath: db.name,
            autoRepair,
            skipIntegrityCheck,
            backupDir,
            pagerCorruption: getPagerCorruption(),
          },
          { signal: deps.getSignal() }
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const packagingUnavailable =
          message === "Database health worker is missing" ||
          message === "Database health worker failed to start";
        if (!packagingUnavailable) throw error;
        console.warn(
          `[DB] Isolated health worker unavailable; using in-process compatibility path: ${message}`
        );
        result = runDirect();
      }
    }

    if (result.repairedCount > 0) invalidateDbCache();
    return result;
  });

  return {
    runIsolated(options?: ManagedHealthCheckOptions) {
      if (getPagerCorruption()) coordinator.invalidate();
      return coordinator.run(options?.autoRepair === true, options?.skipIntegrityCheck === true);
    },
    runDirect(options?: ManagedHealthCheckOptions) {
      const db = deps.getDb();
      return runDbHealthCheck(db, {
        autoRepair: options?.autoRepair === true,
        skipIntegrityCheck: options?.skipIntegrityCheck === true,
        expectedSchemaVersion: "1",
        createBackupBeforeRepair: () => deps.createDirectBackup(db),
      });
    },
  };
}
