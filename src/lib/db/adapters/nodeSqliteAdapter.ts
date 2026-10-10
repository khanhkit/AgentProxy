import type { SqliteAdapter } from "./types";
import {
  createNodeSqliteAdapterFromDatabase,
  type NodeSqliteDatabaseLike,
} from "./nodeSqliteShared";

const CHECKPOINT_INTERVAL_MS = 60_000;

export async function createNodeSqliteAdapter(filePath: string): Promise<SqliteAdapter> {
  const { DatabaseSync } = (await import("node:sqlite" as never)) as {
    DatabaseSync: new (path: string) => NodeSqliteDatabaseLike;
  };

  const db = new DatabaseSync(filePath);

  const checkpointTimer = setInterval(() => {
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {}
  }, CHECKPOINT_INTERVAL_MS);
  (checkpointTimer as unknown as NodeJS.Timeout).unref?.();

  // beforeExit is a local safety checkpoint only. OS signals/final exit are
  // owned by the process lifecycle coordinator/entrypoint, never an adapter.
  const onBeforeExit = () => {
    adapter.close();
  };

  function gracefulClose() {
    clearInterval(checkpointTimer as unknown as NodeJS.Timeout);
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {}
    process.removeListener("beforeExit", onBeforeExit);
  }

  const adapter = createNodeSqliteAdapterFromDatabase(db, filePath, gracefulClose);

  process.once("beforeExit", onBeforeExit);

  return adapter;
}
