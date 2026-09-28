import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const TEST_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "agentproxy-credential-refresh-circuit-")
);
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";
process.env.AGENTPROXY_DISABLE_CREDENTIAL_HEALTH_CHECK = "true";

const originalFetch = globalThis.fetch;
const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const scheduler = await import("../../src/lib/credentialHealth/scheduler.ts");

test.after(() => {
  scheduler.stopCredentialHealthCheck();
  globalThis.fetch = originalFetch;
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
});

test("CredentialHealth parks a connection until refreshCircuit.until without probing upstream", async () => {
  scheduler.stopCredentialHealthCheck();
  globalThis.__agentproxyCredentialHC = undefined;

  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ error: "should-not-probe" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const until = new Date(Date.now() + 10 * 60_000).toISOString();
  const connection = (await providersDb.createProviderConnection({
    provider: "openai",
    authType: "apikey",
    name: "refresh-circuit scheduler guard",
    apiKey: "sk-refresh-circuit-test",
    isActive: true,
    healthCheckInterval: 60,
    providerSpecificData: {
      refreshCircuit: {
        streak: 2,
        until,
        lastFailAt: new Date().toISOString(),
      },
    },
  })) as { id: string };

  await scheduler.forceSweep();

  assert.equal(fetchCalls, 0, "refresh-backoff connections must not hit provider validation");

  const timing = globalThis.__agentproxyCredentialHC?.perConnTiming.get(connection.id);
  assert.ok(timing, "scheduler must persist pacing for the refresh-backoff connection");
  assert.equal(
    timing.nextAttemptAt,
    new Date(until).getTime(),
    "next scheduler attempt must align with refreshCircuit.until"
  );
  assert.ok(
    timing.lastAttemptAt <= timing.nextAttemptAt,
    "scheduler timing must remain internally ordered"
  );
});
