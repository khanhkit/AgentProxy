import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-openwa-auth-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const autoStart = await import("../../src/app/api/services/openwa/auto-start/route.ts");
const autoRestart = await import("../../src/app/api/services/openwa/auto-restart-adopted/route.ts");
const start = await import("../../src/app/api/services/openwa/start/route.ts");
const restart = await import("../../src/app/api/services/openwa/restart/route.ts");
const stop = await import("../../src/app/api/services/openwa/stop/route.ts");
const status = await import("../../src/app/api/services/openwa/status/route.ts");

function unauthenticated(pathname: string, body?: unknown): Request {
  return new Request(`http://localhost${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("OpenWA lifecycle and persisted-control handlers reject unauthenticated HTTP callers", async () => {
  const responses = await Promise.all([
    autoStart.POST(unauthenticated("/api/services/openwa/auto-start", { enabled: true }) as never),
    autoRestart.POST(
      unauthenticated("/api/services/openwa/auto-restart-adopted", { enabled: true }) as never
    ),
    start.POST(unauthenticated("/api/services/openwa/start", {}) as never),
    restart.POST(unauthenticated("/api/services/openwa/restart", {}) as never),
    stop.POST(unauthenticated("/api/services/openwa/stop", {}) as never),
    status.GET(unauthenticated("/api/services/openwa/status") as never),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [401, 401, 401, 401, 401, 401]
  );
});

test("every OpenWA HTTP route has an explicit management-auth gate", () => {
  for (const relative of [
    "auto-start/route.ts",
    "auto-restart-adopted/route.ts",
    "install/route.ts",
    "restart/route.ts",
    "start/route.ts",
    "status/route.ts",
    "stop/route.ts",
    "update/route.ts",
  ]) {
    const source = fs.readFileSync(`src/app/api/services/openwa/${relative}`, "utf8");
    assert.match(source, /requireManagementAuth/);
    assert.match(source, /alwaysRequireAuth:\s*true/);
  }
});
