import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  betterSqlite3Available,
  BETTER_SQLITE3_SKIP_REASON,
} from "./_helpers/betterSqlite3Availability";

const canUseNativeSqlite = betterSqlite3Available();
const hasProcFd = process.platform === "linux" && fs.existsSync("/proc/self/fd");

function countOpenHandlesFor(target: string): number {
  if (!hasProcFd) return 0;
  let count = 0;
  for (const fd of fs.readdirSync("/proc/self/fd")) {
    try {
      const link = fs.readlinkSync(path.join("/proc/self/fd", fd));
      if (link === target || link === `${target} (deleted)`) count++;
    } catch {
      // Descriptor can disappear between readdir/readlink.
    }
  }
  return count;
}

test(
  "post-open initialization failures close the primary native SQLite handle and later success still closes cleanly",
  {
    concurrency: false,
    skip: !canUseNativeSqlite
      ? BETTER_SQLITE3_SKIP_REASON
      : !hasProcFd
        ? "requires Linux /proc/self/fd handle accounting"
        : false,
  },
  async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-ap0100-"));
    const sqliteFile = path.join(dataDir, "storage.sqlite");
    const originalDataDir = process.env.DATA_DIR;
    const originalHealthInterval = process.env.AGENTPROXY_DB_HEALTHCHECK_INTERVAL_MS;
    const require = createRequire(import.meta.url);
    const Database = require("better-sqlite3") as new (file: string) => {
      exec(sql: string): void;
      close(): void;
    };

    try {
      const seed = new Database(sqliteFile);
      seed.exec("CREATE TABLE seed (id INTEGER PRIMARY KEY)");
      seed.close();
      assert.equal(countOpenHandlesFor(sqliteFile), 0, "seed connection must be closed");

      fs.chmodSync(sqliteFile, 0o444);
      process.env.DATA_DIR = dataDir;
      process.env.AGENTPROXY_DB_HEALTHCHECK_INTERVAL_MS = "0";

      const core = await import(`../../src/lib/db/core.ts?ap0100=${Date.now()}`);

      for (let attempt = 1; attempt <= 3; attempt++) {
        assert.throws(
          () => core.getDbInstance(),
          /readonly|read-only|attempt to write/i,
          `attempt ${attempt} should fail after native open`
        );
        assert.equal(
          countOpenHandlesFor(sqliteFile),
          0,
          `attempt ${attempt} must not leak the primary SQLite handle`
        );
        assert.equal(globalThis.__agentproxyDb, undefined, "failed init must not publish a singleton");
      }

      fs.chmodSync(sqliteFile, 0o600);
      const db = core.getDbInstance();
      assert.equal(db.open, true);
      assert.ok(countOpenHandlesFor(sqliteFile) >= 1, "successful init should own a live handle");
      assert.equal(core.closeDbInstance({ checkpointMode: null }), true);
      assert.equal(countOpenHandlesFor(sqliteFile), 0, "closeDbInstance must release the live handle");
      assert.equal(globalThis.__agentproxyDb, undefined);
    } finally {
      try {
        if (globalThis.__agentproxyDb?.open) globalThis.__agentproxyDb.close();
      } catch {}
      delete globalThis.__agentproxyDb;
      try {
        fs.chmodSync(sqliteFile, 0o600);
      } catch {}
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      if (originalDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = originalDataDir;
      if (originalHealthInterval === undefined) delete process.env.AGENTPROXY_DB_HEALTHCHECK_INTERVAL_MS;
      else process.env.AGENTPROXY_DB_HEALTHCHECK_INTERVAL_MS = originalHealthInterval;
    }
  }
);
