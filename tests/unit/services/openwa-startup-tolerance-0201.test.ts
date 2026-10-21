import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";

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

const OPENWA_ROUTE_LIB_SOURCE = fs.readFileSync(
  new URL("../../../src/app/api/services/openwa/_lib.ts", import.meta.url),
  "utf8"
);

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("condition did not become true before timeout");
}

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("on-demand OpenWA supervisor preserves startup health tolerance", () => {
  assert.match(
    OPENWA_ROUTE_LIB_SOURCE,
    /healthFailureDuringStartup:\s*["']tolerate["']/,
    "direct OpenWA API startup must keep the same QR-pairing tolerance as bootstrap"
  );
});

test("startup health failures keep an interactive service starting until pairing completes", async () => {
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

  let healthServer: http.Server | null = null;
  try {
    const status = await sup.start();
    assert.equal(status.state, "starting");
    assert.equal(status.health, "unhealthy");

    healthServer = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    await new Promise<void>((resolve, reject) => {
      healthServer!.once("error", reject);
      healthServer!.listen(29983, "127.0.0.1", resolve);
    });

    await waitFor(() => {
      const recovered = sup.getStatus();
      return recovered.state === "running" && recovered.health === "healthy";
    });

    const recovered = sup.getStatus();
    assert.equal(recovered.state, "running");
    assert.equal(recovered.health, "healthy");
  } finally {
    if (healthServer) {
      await new Promise<void>((resolve) => healthServer!.close(() => resolve()));
    }
    await sup.stop();
  }
});
