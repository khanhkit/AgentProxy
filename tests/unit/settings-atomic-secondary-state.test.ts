import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "agentproxy-settings-atomic-secondary-")
);
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.REQUIRE_API_KEY = "false";

const core = await import("../../src/lib/db/core.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const upstreamProxy = await import("../../src/lib/db/upstreamProxy.ts");
const runtimeSettings = await import("../../src/lib/config/runtimeSettings.ts");
const settingsRoute = await import("../../src/app/api/settings/route.ts");
const { makeManagementSessionRequest } = await import("../helpers/managementSession.ts");

function resetStorage() {
  runtimeSettings.resetRuntimeSettingsStateForTests();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

async function patch(body: Record<string, unknown>): Promise<Response> {
  return settingsRoute.PATCH(
    await makeManagementSessionRequest("http://localhost/api/settings", {
      method: "PATCH",
      body,
    })
  );
}

async function seedActiveProvider(provider: string) {
  return providersDb.createProviderConnection({
    provider,
    authType: "none",
    isActive: true,
  });
}

test.beforeEach(resetStorage);
test.after(resetStorage);

test("invalid cliproxyapi_url changes neither primary settings nor revision", async () => {
  const beforeRevision = await settingsDb.getSettingsRevision();
  const before = await settingsDb.getSettings();

  const response = await patch({
    debugMode: true,
    cliproxyapi_url: "http://10.0.0.5:8317",
  });

  assert.equal(response.status, 400);
  assert.equal((await settingsDb.getSettings()).debugMode, before.debugMode);
  assert.equal(await settingsDb.getSettingsRevision(), beforeRevision);
});

test("secondary upstream-proxy failure rolls back primary settings and shared revision", async () => {
  await seedActiveProvider("openai");
  const beforeRevision = await settingsDb.getSettingsRevision();
  const before = await settingsDb.getSettings();
  const db = core.getDbInstance();
  db.exec(`
    CREATE TRIGGER fail_upstream_proxy_write
    BEFORE INSERT ON upstream_proxy_config
    BEGIN
      SELECT RAISE(ABORT, 'injected upstream proxy failure');
    END;
  `);

  const response = await patch({
    debugMode: true,
    cliproxyapi_fallback_enabled: true,
  });

  assert.equal(response.status, 500);
  assert.equal((await settingsDb.getSettings()).debugMode, before.debugMode);
  assert.equal(await settingsDb.getSettingsRevision(), beforeRevision);
  assert.equal(await upstreamProxy.getUpstreamProxyConfig("openai"), null);
});

test("combined settings and upstream-proxy mutation commits atomically with one revision bump", async () => {
  await seedActiveProvider("openai");
  await seedActiveProvider("anthropic");
  const beforeRevision = await settingsDb.getSettingsRevision();

  const response = await patch({
    debugMode: true,
    cliproxyapi_url: "http://localhost:8317",
    cliproxyapi_fallback_enabled: true,
    cliproxyapi_model_mapping: { "gpt-4o": "gpt-4o-mini" },
  });

  assert.equal(response.status, 200);
  assert.equal(await settingsDb.getSettingsRevision(), beforeRevision + 1);
  assert.equal((await settingsDb.getSettings()).debugMode, true);

  for (const providerId of ["openai", "anthropic", "cliproxyapi"]) {
    const config = await upstreamProxy.getUpstreamProxyConfig(providerId);
    assert.ok(config, `${providerId} upstream row must commit with settings`);
    assert.equal(config.mode, "fallback");
    assert.equal(config.enabled, true);
  }
  assert.deepEqual(
    (await upstreamProxy.getUpstreamProxyConfig("cliproxyapi"))?.cliproxyapiModelMapping,
    { "gpt-4o": "gpt-4o-mini" }
  );
});

test("runtime activation failure is returned as actionable desired-vs-active divergence", async () => {
  const baseline = await settingsDb.getSettingsCandidate();
  await runtimeSettings.applyRuntimeSettingsCandidate(baseline, {
    force: true,
    source: "test:baseline",
  });

  runtimeSettings.setRuntimeSettingsFaultInjectorForTests((section) => {
    if (section === "bannedSignals") throw new Error("injected activation failure");
  });

  try {
    const response = await patch({ customBannedSignals: ["task6-injected"] });
    const payload = (await response.json()) as {
      error?: {
        code?: string;
        desiredRevision?: number;
        activeRevision?: number | null;
        message?: string;
      };
    };

    assert.equal(response.status, 500);
    assert.equal(payload.error?.code, "RUNTIME_SETTINGS_ACTIVATION_FAILED");
    assert.equal(payload.error?.desiredRevision, baseline.revision + 1);
    assert.equal(payload.error?.activeRevision, baseline.revision);
    assert.match(String(payload.error?.message || ""), /persisted but runtime activation failed/i);
  } finally {
    runtimeSettings.setRuntimeSettingsFaultInjectorForTests(null);
  }
});
