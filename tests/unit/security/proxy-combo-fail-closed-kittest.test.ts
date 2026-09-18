import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-ap-iss-0025-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "test-secret";
delete process.env.PROXY_FAIL_OPEN;

const core = await import("../../../src/lib/db/core.ts");
const proxiesDb = await import("../../../src/lib/db/proxies.ts");
const providersDb = await import("../../../src/lib/db/providers.ts");
const combosDb = await import("../../../src/lib/db/combos.ts");
const { safeResolveProxy } = await import("../../../src/sse/handlers/chatHelpers.ts");

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

async function makeConnection(provider = "openai") {
  const connection = await providersDb.createProviderConnection({
    provider,
    authType: "apiKey",
    apiKey: "sk-test",
    name: `AP-ISS-0025 ${provider} ${Date.now()} ${Math.random()}`,
  });
  return (connection as { id: string }).id;
}

async function makeComboForProvider(provider: string) {
  const combo = await combosDb.createCombo({
    name: `ap-iss-0025-${provider}-${Date.now()}`,
    strategy: "round-robin",
    models: [`${provider}/gpt-test`],
  });
  return (combo as { id: string }).id;
}

test.after(async () => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("AP-ISS-0025: dead combo-scoped assignment blocks DIRECT fallback", async () => {
  await resetStorage();
  const connectionId = await makeConnection("openai");
  const comboId = await makeComboForProvider("openai");
  const proxy = await proxiesDb.createProxy({
    name: "dead combo proxy",
    type: "http",
    host: "127.0.0.1",
    port: 19025,
  });
  assert.ok(proxy?.id);
  await proxiesDb.updateProxy(proxy.id, { status: "inactive" });
  await proxiesDb.assignProxyToScope("combo", comboId, proxy.id);

  assert.equal(
    proxiesDb.hasBlockingProxyAssignment(connectionId, "openai"),
    true,
    "dead combo assignment must be part of the fail-closed guard"
  );

  await assert.rejects(
    safeResolveProxy(connectionId, undefined, "openai"),
    (error: unknown) =>
      error instanceof Error &&
      (error as Error & { code?: string }).code === "PROXY_ASSIGNED_UNAVAILABLE",
    "DIRECT fallback must be rejected before any upstream socket can be opened"
  );
});

test("AP-ISS-0025: healthy combo-scoped assignment remains non-blocking", async () => {
  await resetStorage();
  const connectionId = await makeConnection("openai");
  const comboId = await makeComboForProvider("openai");
  const proxy = await proxiesDb.createProxy({
    name: "healthy combo proxy",
    type: "http",
    host: "127.0.0.1",
    port: 19026,
  });
  assert.ok(proxy?.id);
  await proxiesDb.assignProxyToScope("combo", comboId, proxy.id);

  assert.equal(proxiesDb.hasBlockingProxyAssignment(connectionId, "openai"), false);
  const resolved = await safeResolveProxy(connectionId, undefined, "openai");
  assert.equal((resolved as { level?: string } | null)?.level, "combo");
});

test("AP-ISS-0025: proxy-resolution DB failure fails closed", async () => {
  await resetStorage();
  const connectionId = await makeConnection("openai");
  const db = core.getDbInstance();
  db.exec("DROP TABLE proxy_assignments");

  assert.equal(
    proxiesDb.hasBlockingProxyAssignment(connectionId, "openai"),
    true,
    "resolution-state DB errors must never silently authorize DIRECT egress"
  );
});
