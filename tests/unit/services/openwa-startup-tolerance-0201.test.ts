import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-openwa-startup-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.NODE_ENV = "test";
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";

const core = await import("../../../src/lib/db/core.ts");
const db = core.getDbInstance();
db.prepare(
  `INSERT OR IGNORE INTO version_manager (tool, status, port, auto_start, auto_update, provider_expose)
   VALUES ('openwa-startup-test', 'stopped', 29983, 0, 0, 0)`
).run();
const { ServiceSupervisor } = await import("../../../src/lib/services/ServiceSupervisor.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("startup health failures can be tolerated while an interactive service waits for pairing", async () => {
  const sup = new ServiceSupervisor({
    tool: "openwa-startup-test",
    port: 29983,
    spawnArgs: () => ({
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      env: { ...process.env },
      cwd: process.cwd(),
    }),
    healthUrl: () => "http://127.0.0.1:29983/health",
    healthIntervalMs: 25,
    healthFailureDuringStartup: "tolerate",
    stopTimeoutMs: 500,
    logsBufferBytes: 1024,
  });

  try {
    const status = await sup.start();
    assert.equal(status.state, "running");
    assert.equal(status.health, "unhealthy");
  } finally {
    await sup.stop();
  }
});
