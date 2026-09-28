import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-egress-failures-route-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.OMNIROUTE_DISABLE_BACKGROUND_SERVICES = "true";
process.env.API_KEY_SECRET = "test-api-key-secret";

const core = await import("../../src/lib/db/core.ts");
const proxiesDb = await import("../../src/lib/db/proxies.ts");
const { updateSettings } = await import("@/lib/db/settings");
const apiKeysDb = await import("../../src/lib/db/apiKeys.ts");
const route = await import("../../src/app/api/settings/proxies/egress/route.ts");

async function setupAuth() {
  process.env.INITIAL_PASSWORD = "bootstrap-password";
  await updateSettings({ requireLogin: true, password: "" });
  const key = await apiKeysDb.createApiKey("admin-key", "machine-test", ["manage"]);
  return key.key;
}

function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(resetStorage);
test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("GET scoped egress diagnostics adds poolFailures without raw proxy error text", async () => {
  const bearer = await setupAuth();
  const proxy = await proxiesDb.createProxy({
    name: "pool member",
    type: "http",
    host: "10.8.0.1",
    port: 38081,
  });
  await proxiesDb.addProxyToScopePool("provider", "openai", proxy.id);
  core
    .getDbInstance()
    .prepare(
      `INSERT INTO proxy_logs
       (id, timestamp, status, proxy_type, proxy_host, proxy_port, level, connection_id, egress_ip, error)
       VALUES (?, ?, 'error', 'http', ?, ?, 'provider', 'conn-1', '203.0.113.8', ?)`
    )
    .run(randomUUID(), new Date().toISOString(), proxy.host, proxy.port, "HTTP 429 secret upstream body");

  const response = await route.GET(
    new Request("https://example.com/api/settings/proxies/egress?scope=provider&scopeId=openai", {
      headers: { authorization: `Bearer ${bearer}` },
    })
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.connections), "existing diagnostics payload remains present");
  assert.deepEqual(body.poolFailures.byExit, [
    {
      exit: "203.0.113.8",
      failures: 1,
      byFamily: [{ family: "rate_limited", count: 1 }],
    },
  ]);
  assert.equal(body.poolFailures.unattributed, 0);
  assert.ok(!JSON.stringify(body.poolFailures).includes("secret upstream body"));
});

test("GET scoped diagnostics requires scopeId outside global", async () => {
  const bearer = await setupAuth();
  const response = await route.GET(
    new Request("https://example.com/api/settings/proxies/egress?scope=provider", {
      headers: { authorization: `Bearer ${bearer}` },
    })
  );
  assert.equal(response.status, 400);
});
