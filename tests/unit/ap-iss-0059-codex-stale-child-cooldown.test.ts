import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-ap-iss-0059-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "ap-iss-0059-test-secret";

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const quotaCache = await import("../../src/domain/quotaCache.ts");
const codexAccount = await import("../../open-sse/services/codexAccount/index.ts");
const auth = await import("../../src/sse/services/auth.ts");

function futureIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

async function resetStorage(): Promise<void> {
  core.resetDbInstance();
  quotaCache.__clearForTests();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(resetStorage);

test.after(() => {
  core.resetDbInstance();
  quotaCache.__clearForTests();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("AP-ISS-0059: fresh authoritative Codex quota headroom clears a six-day child cooldown before selection", async () => {
  const connection = await providersDb.createProviderConnection({
    provider: "codex",
    authType: "oauth",
    name: "ap-iss-0059-stale-cooldown",
    apiKey: null,
    accessToken: "ap-iss-0059-access",
    refreshToken: "ap-iss-0059-refresh",
    isActive: true,
    testStatus: "active",
    providerSpecificData: {},
  });
  const connectionId = (connection as { id: string }).id;
  const sixDaysMs = 6 * 24 * 60 * 60 * 1000;

  // Reproduce the audit finding: a 429 reports the long weekly window exhausted,
  // persisting an authoritative quota_reset child cooldown six days into the future.
  const persisted = await codexAccount.persistCodexChildQuotaResponse({
    connectionId,
    model: "gpt-5.5",
    status: 429,
    headers: {
      "x-codex-5h-usage": "10",
      "x-codex-5h-limit": "100",
      "x-codex-5h-reset-at": futureIso(60 * 60 * 1000),
      "x-codex-7d-usage": "100",
      "x-codex-7d-limit": "100",
      "x-codex-7d-reset-at": futureIso(sixDaysMs),
    },
  });
  assert.ok(persisted);

  const blocked = await auth.getProviderCredentials("codex", null, null, "gpt-5.5");
  assert.equal(blocked.allRateLimited, true, "six-day child cooldown must initially block selection");

  // A later quota refresh is authoritative current capacity evidence for BOTH
  // normal Codex windows. Recovery must not depend on first making a successful
  // inference, because the stale child cooldown prevents that inference.
  quotaCache.setQuotaCache(connectionId, "codex", {
    session: {
      used: 10,
      total: 100,
      remainingPercentage: 90,
      resetAt: futureIso(5 * 60 * 60 * 1000),
    },
    weekly: {
      used: 10,
      total: 100,
      remainingPercentage: 90,
      resetAt: futureIso(sixDaysMs),
    },
  });

  const refreshed = await providersDb.getProviderConnectionById(connectionId);
  assert.ok(refreshed);
  assert.equal(
    codexAccount.getCodexChildCooldown(refreshed as never, "gpt-5.5"),
    null,
    "fresh full-scope quota headroom must reconcile the stale child lock"
  );

  const selected = await auth.getProviderCredentials("codex", null, null, "gpt-5.5");
  assert.equal(selected.connectionId, connectionId, "reconciled child must be selectable immediately");

  // Simulate a process/cache restart. The fresh quota snapshots must still outrank
  // the older persisted 429 quota payload when request-time hydration runs again.
  quotaCache.__clearForTests();
  const selectedAfterCacheReset = await auth.getProviderCredentials("codex", null, null, "gpt-5.5");
  assert.equal(
    selectedAfterCacheReset.connectionId,
    connectionId,
    "fresh persisted quota evidence must survive cache reset without resurrecting the stale lock"
  );
});

test("AP-ISS-0059: incomplete fresh quota evidence cannot clear an authoritative child cooldown", async () => {
  const connection = await providersDb.createProviderConnection({
    provider: "codex",
    authType: "oauth",
    name: "ap-iss-0059-partial-headroom",
    apiKey: null,
    accessToken: "ap-iss-0059-partial-access",
    refreshToken: "ap-iss-0059-partial-refresh",
    isActive: true,
    testStatus: "active",
    providerSpecificData: {},
  });
  const connectionId = (connection as { id: string }).id;
  const sixDaysMs = 6 * 24 * 60 * 60 * 1000;

  await codexAccount.persistCodexChildQuotaResponse({
    connectionId,
    model: "gpt-5.5",
    status: 429,
    headers: {
      "x-codex-5h-usage": "10",
      "x-codex-5h-limit": "100",
      "x-codex-5h-reset-at": futureIso(60 * 60 * 1000),
      "x-codex-7d-usage": "100",
      "x-codex-7d-limit": "100",
      "x-codex-7d-reset-at": futureIso(sixDaysMs),
    },
  });

  quotaCache.setQuotaCache(connectionId, "codex", {
    session: {
      used: 10,
      total: 100,
      remainingPercentage: 90,
      resetAt: futureIso(5 * 60 * 60 * 1000),
    },
  });

  const refreshed = await providersDb.getProviderConnectionById(connectionId);
  assert.ok(refreshed);
  assert.ok(
    codexAccount.getCodexChildCooldown(refreshed as never, "gpt-5.5"),
    "one healthy window is insufficient to override an authoritative weekly reset"
  );

  const blocked = await auth.getProviderCredentials("codex", null, null, "gpt-5.5");
  assert.equal(blocked.allRateLimited, true);
});
