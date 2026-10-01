import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-issue-13470-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "test-secret";
delete process.env.PROXY_FAIL_OPEN;

const core = await import("../../src/lib/db/core.ts");
const proxiesDb = await import("../../src/lib/db/proxies.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const tokenHealthCheckProxyGuard = await import("../../src/lib/tokenHealthCheckProxyGuard.ts");

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

async function makeConnection(provider = "claude") {
  const conn = await providersDb.createProviderConnection({
    provider, authType: "oauth", name: `Conn ${Date.now()} ${Math.random()}`,
    accessToken: "at-test", refreshToken: "rt-test",
  });
  return (conn as { id: string }).id;
}

async function assignDeadProxy(scope: "account" | "provider", scopeId: string) {
  const proxy = await proxiesDb.createProxy({
    name: `Dead ${scope} proxy`, type: "http", host: "127.0.0.1", port: 9470,
  });
  await proxiesDb.updateProxy(proxy!.id, { status: "inactive" });
  await proxiesDb.assignProxyToScope(scope, scopeId, proxy!.id);
}

test.after(() => { core.resetDbInstance(); fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }); });

test("#13470: background health refresh blocks a dead account proxy pool", async () => {
  await resetStorage();
  const connId = await makeConnection();
  await assignDeadProxy("account", connId);
  const result = await tokenHealthCheckProxyGuard.resolveGuardedProxyConfig(connId, "claude");
  assert.deepEqual(result, { proxyConfig: null, blocked: true });
});

test("#13470: background health refresh blocks a dead provider proxy pool", async () => {
  await resetStorage();
  const connId = await makeConnection();
  await assignDeadProxy("provider", "claude");
  const result = await tokenHealthCheckProxyGuard.resolveGuardedProxyConfig(connId, "claude");
  assert.deepEqual(result, { proxyConfig: null, blocked: true });
});

test("#13470: background health refresh permits legitimate direct egress with no assignment", async () => {
  await resetStorage();
  const connId = await makeConnection("openai");
  const result = await tokenHealthCheckProxyGuard.resolveGuardedProxyConfig(connId, "openai");
  assert.equal(result.blocked, false);
  assert.equal(result.proxyConfig, null);
});

test("#13470: explicit per-connection proxy disable still permits direct egress", async () => {
  await resetStorage();
  const connId = await makeConnection();
  await assignDeadProxy("account", connId);
  await providersDb.updateProviderConnection(connId, { proxyEnabled: false });
  const result = await tokenHealthCheckProxyGuard.resolveGuardedProxyConfig(connId, "claude");
  assert.equal(result.blocked, false);
});
