/**
 * #13614 — stale LKGP pin clears on the combo fallback path stay non-blocking, and a
 * failed clear is logged with the combo and execution key instead of a bare error.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-stale-lkgp-13614-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
process.env.DATA_DIR = TEST_DATA_DIR;

const { clearStaleLKGP } = await import("../../../open-sse/services/combo/staleLkgpClear.ts");
const combo = await import("../../../open-sse/services/combo.ts");
const { setLKGP, getLKGP } = await import("../../../src/lib/db/settings.ts");
const dbCore = await import("../../../src/lib/db/core.ts");

test.after(() => {
  try {
    dbCore.resetDbInstance();
  } catch {
    /* ignore */
  }
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function captureWarn() {
  const warnings: Array<{ tag: string; msg: string; data: Record<string, unknown> }> = [];
  return {
    warnings,
    log: {
      warn: (tag: string, msg: string, data?: unknown) =>
        warnings.push({ tag, msg, data: (data ?? {}) as Record<string, unknown> }),
    },
  };
}

test("combo.ts re-exports the non-blocking clear (single implementation)", () => {
  assert.equal(combo.clearStaleLKGP, clearStaleLKGP);
});

test("a failed clear resolves and warns with the combo and execution key", async () => {
  const { warnings, log } = captureWarn();
  const failure = new Error("database is locked");
  const pending = clearStaleLKGP("combo-a", "ek-7", "combo-id-a", log, "COMBO-RR", async () => {
    throw failure;
  });
  await assert.doesNotReject(pending);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].tag, "COMBO-RR");
  assert.match(warnings[0].msg, /Failed to clear Last Known Good Provider/);
  assert.equal(warnings[0].data.combo, "combo-a");
  assert.equal(warnings[0].data.comboId, "combo-id-a");
  assert.equal(warnings[0].data.executionKey, "ek-7");
  assert.equal(warnings[0].data.err, failure);
});

test("a synchronous throw from the writer is caught the same way", async () => {
  const { warnings, log } = captureWarn();
  await clearStaleLKGP("combo-b", null, null, log, "COMBO", (() => {
    throw new Error("sync boom");
  }) as unknown as (c: string, k: string) => Promise<void>);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].data.executionKey, null);
});

test("the call returns before the writes settle (the fallback loop never waits)", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cleared: string[] = [];
  let settled = false;
  const pending = clearStaleLKGP("combo-c", "ek-c", "id-c", null, "COMBO", async (_c, key) => {
    await gate;
    cleared.push(key);
  }).then(() => {
    settled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, "clear must still be pending while the caller moves on");
  release();
  await pending;
  assert.deepEqual(cleared.sort(), ["ek-c", "id-c"]);
});

test("default writer clears both persisted pins in the real DB, no warning", async () => {
  await setLKGP("combo-db", "combo-db-id", "openai", "conn-1");
  await setLKGP("combo-db", "ek-db", "openai", "conn-1");
  assert.ok(await getLKGP("combo-db", "combo-db-id"));
  const { warnings, log } = captureWarn();
  await clearStaleLKGP("combo-db", "ek-db", "combo-db-id", log, "COMBO");
  assert.equal(await getLKGP("combo-db", "combo-db-id"), null);
  assert.equal(await getLKGP("combo-db", "ek-db"), null);
  assert.deepEqual(warnings, []);
});

test("failed-target clear uses compare-delete instead of the unsafe generic writer", async () => {
  const settings = await import("../../../src/lib/db/settings.ts");
  const comboName = "combo-race-path";
  const modelId = "combo-race-path-id";
  await settings.setLKGP(comboName, modelId, "openai", "conn-old");
  let genericClearCalls = 0;

  await clearStaleLKGP(
    comboName,
    null,
    modelId,
    null,
    "COMBO",
    async () => {
      genericClearCalls += 1;
    },
    { provider: "openai", connectionId: "conn-old" }
  );

  assert.equal(genericClearCalls, 0);
  assert.equal(await settings.getLKGP(comboName, modelId), null);
});

test("atomic LKGP compare-delete preserves a newer replacement pin", async () => {
  const settings = await import("../../../src/lib/db/settings.ts");
  const comboName = "combo-cas";
  const modelId = "combo-cas-id";
  await settings.setLKGP(comboName, modelId, "openai", "conn-old");
  const observed = await settings.getLKGP(comboName, modelId);
  assert.ok(observed);

  await settings.setLKGP(comboName, modelId, "anthropic", "conn-new");
  const deleted = await settings.clearLKGPIfMatch(comboName, modelId, observed);

  assert.equal(deleted, false);
  assert.deepEqual(await settings.getLKGP(comboName, modelId), {
    provider: "anthropic",
    connectionId: "conn-new",
  });
});

test("atomic LKGP compare-delete accepts legacy semantic encodings without deleting replacements", async () => {
  const settings = await import("../../../src/lib/db/settings.ts");
  const db = dbCore.getDbInstance();

  db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('lkgp', ?, ?)")
    .run("combo-legacy:model-a", JSON.stringify("openai"));
  const legacyObserved = await settings.getLKGP("combo-legacy", "model-a");
  assert.deepEqual(legacyObserved, { provider: "openai" });
  assert.equal(await settings.clearLKGPIfMatch("combo-legacy", "model-a", legacyObserved!), true);
  assert.equal(await settings.getLKGP("combo-legacy", "model-a"), null);

  db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('lkgp', ?, ?)")
    .run("combo-legacy:model-b", JSON.stringify({ connectionId: "conn-1", provider: "openai" }));
  const reorderedObserved = await settings.getLKGP("combo-legacy", "model-b");
  assert.deepEqual(reorderedObserved, { connectionId: "conn-1", provider: "openai" });
  assert.equal(await settings.clearLKGPIfMatch("combo-legacy", "model-b", reorderedObserved!), true);
  assert.equal(await settings.getLKGP("combo-legacy", "model-b"), null);

  db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('lkgp', ?, ?)")
    .run("combo-legacy:model-number", JSON.stringify(123));
  assert.deepEqual(await settings.getLKGP("combo-legacy", "model-number"), { provider: "123" });

  db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('lkgp', ?, ?)")
    .run("combo-legacy:model-boolean", JSON.stringify(true));
  assert.deepEqual(await settings.getLKGP("combo-legacy", "model-boolean"), { provider: "true" });
});

test("malformed structured LKGP rows fail closed instead of entering provider routing", async () => {
  const settings = await import("../../../src/lib/db/settings.ts");
  const db = dbCore.getDbInstance();
  const rows: Array<[string, unknown]> = [
    ["numeric-provider", { provider: 123 }],
    ["null-provider", { provider: null }],
    ["empty-provider", { provider: "" }],
    ["numeric-connection", { provider: "openai", connectionId: 123 }],
  ];

  for (const [modelId, value] of rows) {
    db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('lkgp', ?, ?)")
      .run(`combo-malformed:${modelId}`, JSON.stringify(value));
    assert.equal(await settings.getLKGP("combo-malformed", modelId), null, modelId);
  }
});

test("LKGP invalidation fences an in-flight read from repopulating a deleted pin", async () => {
  const settings = await import("../../../src/lib/db/settings.ts");
  const cache = await import("../../../src/lib/db/readCache.ts");
  const comboName = "combo-read-race";
  const modelId = "model-race";
  const key = `${comboName}:${modelId}`;

  await settings.setLKGP(comboName, modelId, "openai", "conn-old");
  cache.invalidateCachedLKGP(key);

  const db = dbCore.getDbInstance();
  const originalPrepare = db.prepare.bind(db);
  let intercepted = false;
  db.prepare = ((sql: string) => {
    const statement = originalPrepare(sql);
    if (!intercepted && sql.includes("SELECT value FROM key_value WHERE namespace = 'lkgp'")) {
      return {
        get: (...args: unknown[]) => {
          const row = statement.get(...args);
          intercepted = true;
          db.prepare = originalPrepare;
          originalPrepare("DELETE FROM key_value WHERE namespace = 'lkgp' AND key = ?").run(key);
          cache.invalidateCachedLKGP(key);
          return row;
        },
      };
    }
    return statement;
  }) as typeof db.prepare;

  try {
    assert.deepEqual(await cache.getCachedLKGP(comboName, modelId), {
      provider: "openai",
      connectionId: "conn-old",
    });
  } finally {
    db.prepare = originalPrepare;
  }

  assert.equal(intercepted, true);
  assert.equal(await settings.getLKGP(comboName, modelId), null);
  assert.equal(await cache.getCachedLKGP(comboName, modelId), null);
});

test("LKGP idle invalidations do not allocate persistent per-key generation state", async () => {
  const cache = await import("../../../src/lib/db/readCache.ts");
  const originalSet = Map.prototype.set;
  const allocatedKeys = new Set<string>();
  const prefix = "lkgp:combo-version-bounded-";

  Map.prototype.set = function (key, value) {
    if (typeof key === "string" && key.startsWith(prefix)) allocatedKeys.add(key);
    return originalSet.call(this, key, value);
  };

  try {
    for (let index = 0; index < 64; index += 1) {
      cache.invalidateCachedLKGP(`combo-version-bounded-${index}:model`);
    }
  } finally {
    Map.prototype.set = originalSet;
    cache.invalidateCachedLKGP();
  }

  assert.equal(
    allocatedKeys.size,
    0,
    "invalidating idle LKGP keys must not create retained per-key generation entries"
  );
});
