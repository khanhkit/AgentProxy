import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { NextRequest } from "next/server";

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-keyless-models-"));
const originalEnv = {
  DATA_DIR: process.env.DATA_DIR,
  API_KEY_SECRET: process.env.API_KEY_SECRET,
  REQUIRE_API_KEY: process.env.REQUIRE_API_KEY,
  INITIAL_PASSWORD: process.env.INITIAL_PASSWORD,
  JWT_SECRET: process.env.JWT_SECRET,
};

process.env.DATA_DIR = testDataDir;
process.env.API_KEY_SECRET = "keyless-models-regression-secret";
process.env.REQUIRE_API_KEY = "false";
delete process.env.INITIAL_PASSWORD;
delete process.env.JWT_SECRET;

const core = await import("../../src/lib/db/core.ts");
const apiKeysDb = await import("../../src/lib/db/apiKeys.ts");
const { runAuthzPipeline } = await import("../../src/server/authz/pipeline.ts");

globalThis.__omnirouteShutdown = { init: false, shuttingDown: false, activeRequests: 0 };

function restoreEnv(name: keyof typeof originalEnv): void {
  const value = originalEnv[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test.after(() => {
  apiKeysDb.resetApiKeyState();
  core.resetDbInstance();
  fs.rmSync(testDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  restoreEnv("DATA_DIR");
  restoreEnv("API_KEY_SECRET");
  restoreEnv("REQUIRE_API_KEY");
  restoreEnv("INITIAL_PASSWORD");
  restoreEnv("JWT_SECRET");
  globalThis.__omnirouteShutdown = { init: false, shuttingDown: false, activeRequests: 0 };
});

test("keyless local-first models routes remain anonymous when REQUIRE_API_KEY=false", async () => {
  const paths = ["/api/v1/models", "/v1/models", "/models", "/v1/v1/models"];

  for (const pathname of paths) {
    const response = await runAuthzPipeline(
      new NextRequest(`http://127.0.0.1:20128${pathname}`, { method: "GET" }),
      { enforce: true }
    );

    assert.equal(response.status, 200, pathname);
    assert.equal(response.headers.get("x-omniroute-route-class"), "CLIENT_API", pathname);
  }
});
