import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-feature-revision-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const featureFlags = await import("../../src/lib/db/featureFlags.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const { advanceSettingsRevision } = await import("../../src/lib/db/settingsRevision.ts");
const { resolveFeatureFlag, isFeatureFlagEnabled } =
  await import("../../src/shared/utils/featureFlags.ts");
const { PIIMaskerGuardrail } = await import("../../src/lib/guardrails/piiMasker.ts");

const FLAG = "PII_REDACTION_ENABLED";

function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  delete process.env[FLAG];
}

test.beforeEach(resetStorage);
test.after(resetStorage);

test("set, remove, and clear each advance the shared settings revision exactly once", async () => {
  const revision0 = await settingsDb.getSettingsRevision();

  featureFlags.setFeatureFlagOverride(FLAG, "true");
  assert.equal(await settingsDb.getSettingsRevision(), revision0 + 1);

  featureFlags.removeFeatureFlagOverride(FLAG);
  assert.equal(await settingsDb.getSettingsRevision(), revision0 + 2);

  featureFlags.setFeatureFlagOverride(FLAG, "true");
  const beforeClear = await settingsDb.getSettingsRevision();
  featureFlags.clearAllFeatureFlagOverrides();
  assert.equal(await settingsDb.getSettingsRevision(), beforeClear + 1);
});

test("feature flag override and revision advance are one SQLite transaction", async () => {
  const db = core.getDbInstance();
  db.exec(`
    CREATE TRIGGER fail_settings_revision
    BEFORE INSERT ON key_value
    WHEN NEW.namespace = 'settings' AND NEW.key = '_settingsRevision'
    BEGIN
      SELECT RAISE(ABORT, 'injected revision failure');
    END;
  `);

  assert.throws(
    () => featureFlags.setFeatureFlagOverride(FLAG, "true"),
    /injected revision failure/
  );
  assert.equal(featureFlags.getFeatureFlagOverride(FLAG), undefined);
});

test("settings candidate captures feature overrides at the same durable revision", async () => {
  featureFlags.setFeatureFlagOverride(FLAG, "true");
  const candidate = await settingsDb.getSettingsCandidate();

  assert.equal(candidate.revision, await settingsDb.getSettingsRevision());
  assert.equal(candidate.featureFlagOverrides[FLAG], "true");
});

test("request-pinned overrides stay old after a live write while the next candidate sees new", async () => {
  featureFlags.setFeatureFlagOverride(FLAG, "true");
  const oldCandidate = await settingsDb.getSettingsCandidate();

  featureFlags.setFeatureFlagOverride(FLAG, "false");
  const newCandidate = await settingsDb.getSettingsCandidate();

  assert.equal(resolveFeatureFlag(FLAG, oldCandidate.featureFlagOverrides), "true");
  assert.equal(isFeatureFlagEnabled(FLAG, oldCandidate.featureFlagOverrides), true);
  assert.equal(resolveFeatureFlag(FLAG, newCandidate.featureFlagOverrides), "false");
  assert.equal(newCandidate.revision, oldCandidate.revision + 1);
});

test("DB override > env > default precedence is unchanged", () => {
  process.env[FLAG] = "false";
  featureFlags.setFeatureFlagOverride(FLAG, "true");
  assert.equal(resolveFeatureFlag(FLAG), "true");

  featureFlags.removeFeatureFlagOverride(FLAG);
  assert.equal(resolveFeatureFlag(FLAG), "false");

  delete process.env[FLAG];
  assert.equal(resolveFeatureFlag(FLAG), "false");
});

test("pinned override map is authoritative and performs no feature_flags DB read", () => {
  const db = core.getDbInstance();
  const originalPrepare = db.prepare;
  let featureFlagSelects = 0;
  db.prepare = ((sql: string) => {
    if (sql.includes("feature_flags")) featureFlagSelects++;
    return originalPrepare.call(db, sql);
  }) as typeof db.prepare;

  try {
    process.env[FLAG] = "false";
    assert.equal(resolveFeatureFlag(FLAG, { [FLAG]: "true" }), "true");
    assert.equal(isFeatureFlagEnabled(FLAG, { [FLAG]: "true" }), true);
    assert.equal(featureFlagSelects, 0);
  } finally {
    db.prepare = originalPrepare;
  }
});

test("legacy override cache cannot cross a shared revision boundary", () => {
  featureFlags.setFeatureFlagOverride(FLAG, "true");
  assert.equal(featureFlags.getFeatureFlagOverride(FLAG), "true");

  const db = core.getDbInstance();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('feature_flags', ?, ?)"
    ).run(FLAG, "false");
    advanceSettingsRevision(db);
  });
  tx();

  assert.equal(featureFlags.getFeatureFlagOverride(FLAG), "false");
});

test("PII guardrail uses pinned overrides without an independent feature flag DB refresh", async () => {
  const db = core.getDbInstance();
  const originalPrepare = db.prepare;
  let featureFlagSelects = 0;
  db.prepare = ((sql: string) => {
    if (sql.includes("feature_flags")) featureFlagSelects++;
    return originalPrepare.call(db, sql);
  }) as typeof db.prepare;

  try {
    const guardrail = new PIIMaskerGuardrail();
    const result = await guardrail.preCall(
      { messages: [{ role: "user", content: "email me at alice@example.com" }] },
      { runtimeFeatureFlagOverrides: { [FLAG]: "true" } }
    );
    assert.ok(result.modifiedPayload);
    assert.equal(featureFlagSelects, 0);
  } finally {
    db.prepare = originalPrepare;
  }
});

test("PII post-call guardrail keeps pinned response flags without a DB refresh", async () => {
  const db = core.getDbInstance();
  const originalPrepare = db.prepare;
  let featureFlagSelects = 0;
  db.prepare = ((sql: string) => {
    if (sql.includes("feature_flags")) featureFlagSelects++;
    return originalPrepare.call(db, sql);
  }) as typeof db.prepare;

  try {
    const guardrail = new PIIMaskerGuardrail();
    const result = await guardrail.postCall(
      { choices: [{ message: { content: "alice@example.com" } }] },
      {
        runtimeFeatureFlagOverrides: {
          PII_RESPONSE_SANITIZATION: "true",
          PII_RESPONSE_SANITIZATION_MODE: "redact",
        },
      }
    );
    assert.ok(result.modifiedResponse);
    assert.equal(JSON.stringify(result.modifiedResponse).includes("alice@example.com"), false);
    assert.equal(featureFlagSelects, 0);
  } finally {
    db.prepare = originalPrepare;
  }
});

test("streaming PII transform keeps pinned response flags without a DB refresh", async () => {
  const { createPiiSseTransform } = await import("../../src/lib/streamingPiiTransform.ts");
  const db = core.getDbInstance();
  const originalPrepare = db.prepare;
  let featureFlagSelects = 0;
  db.prepare = ((sql: string) => {
    if (sql.includes("feature_flags")) featureFlagSelects++;
    return originalPrepare.call(db, sql);
  }) as typeof db.prepare;

  process.env.PII_RESPONSE_SANITIZATION = "false";
  process.env.PII_TEST_BYPASS_MIN_WINDOW = "true";
  try {
    const transform = createPiiSseTransform({
      windowSize: 0,
      featureFlagOverrides: {
        PII_RESPONSE_SANITIZATION: "true",
        PII_RESPONSE_SANITIZATION_MODE: "redact",
      },
    });
    const writer = transform.writable.getWriter();
    const reader = transform.readable.getReader();
    const input = `data: {"choices":[{"delta":{"content":"alice@example.com"}}]}\n\n`;
    const write = (async () => {
      await writer.write(new TextEncoder().encode(input));
      await writer.close();
    })();
    let output = "";
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      output += new TextDecoder().decode(next.value);
    }
    await write;
    assert.equal(output.includes("alice@example.com"), false);
    assert.equal(featureFlagSelects, 0);
  } finally {
    db.prepare = originalPrepare;
    delete process.env.PII_RESPONSE_SANITIZATION;
    delete process.env.PII_TEST_BYPASS_MIN_WINDOW;
  }
});
