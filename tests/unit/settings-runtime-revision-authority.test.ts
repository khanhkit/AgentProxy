import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-settings-authority-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const { getDbInstance } = core;

function rawSettingsRevision(): number {
  const row = getDbInstance()
    .prepare(
      "SELECT value FROM key_value WHERE namespace = 'settings' AND key = '_settingsRevision'"
    )
    .get() as { value?: string } | undefined;
  return row?.value ? Number(JSON.parse(row.value)) : 0;
}

function rawSetting(key: string): string | undefined {
  return (
    getDbInstance()
      .prepare("SELECT value FROM key_value WHERE namespace = 'settings' AND key = ?")
      .get(key) as { value?: string } | undefined
  )?.value;
}

function rawFeatureFlag(key: string): string | undefined {
  return (
    getDbInstance()
      .prepare("SELECT value FROM key_value WHERE namespace = 'feature_flags' AND key = ?")
      .get(key) as { value?: string } | undefined
  )?.value;
}

function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  delete process.env.INITIAL_PASSWORD;
}

test.beforeEach(resetStorage);
test.after(() => {
  resetStorage();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

test("getSettingsCandidate returns settings, feature flags and revision from one snapshot", async () => {
  await settingsDb.updateSettings({ debugMode: true });
  const revision = rawSettingsRevision();
  getDbInstance()
    .prepare("INSERT INTO key_value (namespace, key, value) VALUES ('feature_flags', ?, ?)")
    .run("AGENTPROXY_MCP_ENFORCE_SCOPES", "false");

  const candidate = await settingsDb.getSettingsCandidate();

  assert.equal(candidate.revision, revision);
  assert.equal(candidate.settings.debugMode, true);
  assert.equal(candidate.featureFlagOverrides.AGENTPROXY_MCP_ENFORCE_SCOPES, "false");
  assert.equal(rawFeatureFlag("AGENTPROXY_MCP_ENFORCE_SCOPES"), "false");
});

test("getSettings does not persist INITIAL_PASSWORD onboarding state", async () => {
  process.env.INITIAL_PASSWORD = "configured-out-of-band";
  const beforeRevision = rawSettingsRevision();

  const settings = await settingsDb.getSettings();

  assert.equal(settings.setupComplete, undefined);
  assert.equal(rawSetting("setupComplete"), undefined);
  assert.equal(rawSetting("requireLogin"), undefined);
  assert.equal(rawSettingsRevision(), beforeRevision);
});

test("ensureInitialSettingsBootstrap writes setup settings and advances revision exactly once", async () => {
  process.env.INITIAL_PASSWORD = "configured-out-of-band";
  const beforeRevision = rawSettingsRevision();

  const result = await settingsDb.ensureInitialSettingsBootstrap();

  assert.equal(result.changed, true);
  assert.equal(result.candidate.revision, beforeRevision + 1);
  assert.equal(result.candidate.settings.setupComplete, true);
  assert.equal(result.candidate.settings.requireLogin, true);
  assert.equal(rawSettingsRevision(), beforeRevision + 1);
  assert.equal(JSON.parse(rawSetting("setupComplete") ?? "null"), true);
  assert.equal(JSON.parse(rawSetting("requireLogin") ?? "null"), true);

  const second = await settingsDb.ensureInitialSettingsBootstrap();
  assert.equal(second.changed, false);
  assert.equal(second.candidate.revision, beforeRevision + 1);
  assert.equal(rawSettingsRevision(), beforeRevision + 1);
});

test("empty and value-identical updateSettings calls do not advance revision", async () => {
  await settingsDb.updateSettings({ debugMode: true });
  const baseline = await settingsDb.getSettingsRevision();

  await settingsDb.updateSettings({});
  assert.equal(await settingsDb.getSettingsRevision(), baseline);

  await settingsDb.updateSettings({ debugMode: true });
  assert.equal(await settingsDb.getSettingsRevision(), baseline);
});

test("ordinary updateSettings advances revision exactly once", async () => {
  const beforeRevision = await settingsDb.getSettingsRevision();

  await settingsDb.updateSettings({ debugMode: true, logToolSources: true });

  assert.equal(await settingsDb.getSettingsRevision(), beforeRevision + 1);
  assert.equal(rawSettingsRevision(), beforeRevision + 1);
});
