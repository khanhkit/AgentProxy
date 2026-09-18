import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-kittest-oauth-proxy-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "kittest-oauth-proxy-secret";

const core = await import("../../../src/lib/db/core.ts");
const providersDb = await import("../../../src/lib/db/providers.ts");
const proxiesDb = await import("../../../src/lib/db/proxies.ts");
const tokenRefresh = await import("../../../src/sse/services/tokenRefresh.ts");

async function resetStorage(): Promise<void> {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

async function makeClaudeConnection(): Promise<string> {
  const connection = await providersDb.createProviderConnection({
    provider: "claude",
    authType: "oauth",
    name: `KitTest OAuth proxy ${Date.now()} ${Math.random()}`,
    accessToken: "kittest-old-access",
    refreshToken: "kittest-refresh",
  });
  return (connection as { id: string }).id;
}

async function assignDeadAccountProxy(connectionId: string): Promise<void> {
  const proxy = await proxiesDb.createProxy({
    name: `KitTest dead account proxy ${Date.now()} ${Math.random()}`,
    type: "http",
    host: "127.0.0.1",
    port: 65534,
  });
  assert.ok(proxy);
  await proxiesDb.updateProxy(proxy.id, { status: "inactive" });
  await proxiesDb.assignProxyToScope("account", connectionId, proxy.id);
}

async function assignLiveProviderProxy(provider: string): Promise<void> {
  const proxy = await proxiesDb.createProxy({
    name: `KitTest live provider proxy ${Date.now()} ${Math.random()}`,
    type: "http",
    host: "127.0.0.1",
    port: 65533,
  });
  assert.ok(proxy);
  await proxiesDb.assignProxyToScope("provider", provider, proxy.id);
}

function setGlobalProxyEnabled(enabled: boolean): void {
  core
    .getDbInstance()
    .prepare(
      "INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('settings', 'proxyEnabled', ?)"
    )
    .run(JSON.stringify(enabled));
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(async () => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test(
  "TC-OAUTH-PROXY-SEC-001 inactive account assignment remains blocking despite live provider fallback",
  async () => {
    const connectionId = await makeClaudeConnection();
    await assignDeadAccountProxy(connectionId);
    await assignLiveProviderProxy("claude");

    assert.equal(
      proxiesDb.hasBlockingAccountProxyAssignment(connectionId),
      true,
      "a live lower-priority provider proxy must not erase a dead account assignment"
    );
  }
);

test(
  "TC-OAUTH-PROXY-SEC-002 refresh rejects before network with PROXY_ASSIGNED_UNAVAILABLE",
  async () => {
    const connectionId = await makeClaudeConnection();
    await assignDeadAccountProxy(connectionId);
    assert.equal(proxiesDb.hasBlockingAccountProxyAssignment(connectionId), true);

    const originalFetch = globalThis.fetch;
    let networkCalls = 0;
    globalThis.fetch = (async () => {
      networkCalls += 1;
      throw new Error("unexpected network call");
    }) as typeof fetch;

    try {
      await assert.rejects(
        tokenRefresh.refreshClaudeOAuthToken("kittest-refresh-must-not-egress", { connectionId }),
        (error: unknown) =>
          error instanceof Error &&
          (error as Error & { code?: string }).code === "PROXY_ASSIGNED_UNAVAILABLE"
      );
      assert.equal(networkCalls, 0, "refresh must fail before any direct network attempt");
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
);

test(
  "TC-OAUTH-PROXY-SEC-003 explicit proxy-off remains a non-blocking compatibility exception",
  async () => {
    const connectionId = await makeClaudeConnection();
    await assignDeadAccountProxy(connectionId);
    assert.equal(
      proxiesDb.hasBlockingAccountProxyAssignment(connectionId),
      true,
      "dead account assignment must block before the explicit override"
    );

    setGlobalProxyEnabled(false);

    assert.equal(
      proxiesDb.hasBlockingAccountProxyAssignment(connectionId),
      false,
      "explicit global proxy-off must preserve the documented direct-egress exception"
    );
  }
);
