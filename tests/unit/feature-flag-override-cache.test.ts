import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Flag overrides are read on hot paths once per string leaf of a request body,
// so getFeatureFlagOverride caches the SELECT. The cache must still reflect
// every write that goes through this module immediately, and must not survive
// a reopened database.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-test-flag-cache-"));
process.env.DATA_DIR = tmpDir;

const core = await import("../../src/lib/db/core.ts");
const {
  getFeatureFlagOverride,
  setFeatureFlagOverride,
  removeFeatureFlagOverride,
  clearAllFeatureFlagOverrides,
  clearFeatureFlagOverrideCache,
} = await import("../../src/lib/db/featureFlags.ts");

const FLAG = "PII_RESPONSE_SANITIZATION";
const NAMESPACE = "feature_flags";

function writeRaw(value: string) {
  core
    .getDbInstance()
    .prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES (?, ?, ?)")
    .run(NAMESPACE, FLAG, value);
}

test("feature flag override cache", async (t) => {
  await t.test("writes through this module are visible immediately", () => {
    clearAllFeatureFlagOverrides();
    assert.equal(getFeatureFlagOverride(FLAG), undefined);
    setFeatureFlagOverride(FLAG, "true");
    assert.equal(getFeatureFlagOverride(FLAG), "true");
    setFeatureFlagOverride(FLAG, "false");
    assert.equal(getFeatureFlagOverride(FLAG), "false");
    removeFeatureFlagOverride(FLAG);
    assert.equal(getFeatureFlagOverride(FLAG), undefined);
  });

  await t.test("repeated reads are served from the cache until invalidated", () => {
    setFeatureFlagOverride(FLAG, "true");
    assert.equal(getFeatureFlagOverride(FLAG), "true");
    writeRaw("false");
    assert.equal(getFeatureFlagOverride(FLAG), "true", "raw store edit is not seen while cached");
    clearFeatureFlagOverrideCache(FLAG);
    assert.equal(getFeatureFlagOverride(FLAG), "false");
    clearAllFeatureFlagOverrides();
    assert.equal(getFeatureFlagOverride(FLAG), undefined);
  });

  await t.test("warm cache reads do not query the durable settings revision", () => {
    setFeatureFlagOverride(FLAG, "true");
    assert.equal(getFeatureFlagOverride(FLAG), "true");

    const db = core.getDbInstance();
    const originalPrepare = db.prepare;
    let revisionReads = 0;
    let featureFlagReads = 0;
    db.prepare = ((sql: string) => {
      if (sql.includes("namespace = 'settings' AND key = ?")) revisionReads++;
      if (sql.includes("namespace = ? AND key = ?")) featureFlagReads++;
      return originalPrepare.call(db, sql);
    }) as typeof db.prepare;

    try {
      for (let i = 0; i < 20; i++) {
        assert.equal(getFeatureFlagOverride(FLAG), "true");
      }
    } finally {
      db.prepare = originalPrepare;
    }

    assert.equal(
      revisionReads,
      0,
      "warm hot-path reads must not synchronously query revision state"
    );
    assert.equal(featureFlagReads, 0, "warm hot-path reads must not query the feature flag row");
  });

  await t.test("a reopened database starts with an empty cache", () => {
    setFeatureFlagOverride(FLAG, "true");
    assert.equal(getFeatureFlagOverride(FLAG), "true");
    core.resetDbInstance();
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.mkdirSync(tmpDir, { recursive: true });
    assert.equal(getFeatureFlagOverride(FLAG), undefined);
  });
});
