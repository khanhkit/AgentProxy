import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("health-check log cache ignores a stale settings read after a hot value is applied", async () => {
  const env = { ...process.env, NODE_ENV: "production" };
  delete env.VITEST;
  delete env.NEXT_PHASE;
  delete env.AGENTPROXY_HIDE_HEALTHCHECK_LOGS;

  const script = String.raw`
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-health-log-race-"));
    const settings = await import("./src/lib/db/settings.ts");
    const health = await import("./src/lib/tokenHealthCheck.ts");

    await settings.updateSettings({ hideHealthCheckLogs: false });
    health.clearHealthCheckLogCache(null);
    const staleRead = health.shouldHideLogs();
    health.clearHealthCheckLogCache(true);

    const first = await staleRead;
    const second = await health.shouldHideLogs();
    process.stdout.write(JSON.stringify({ first, second }));
  `;

  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx/esm", "--eval", script],
    { cwd: process.cwd(), env }
  );
  const result = JSON.parse(stdout.slice(stdout.lastIndexOf("{")).trim()) as {
    first: boolean;
    second: boolean;
  };

  assert.deepEqual(result, { first: true, second: true });
});
