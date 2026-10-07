import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { makeManagementSessionRequest } from "../helpers/managementSession.ts";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-codex-release-route-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_INITIAL_PASSWORD = process.env.INITIAL_PASSWORD;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_API_KEY_SECRET = process.env.API_KEY_SECRET;

process.env.DATA_DIR = TEST_DATA_DIR;
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";
process.env.INITIAL_PASSWORD = "codex-release-password";
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "codex-release-test-secret";

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const route = await import("../../src/app/api/providers/codex-cooldown/route.ts");

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  await settingsDb.updateSettings({ requireLogin: true, password: "" });
}

async function seedCodexConnection() {
  return providersDb.createProviderConnection({
    provider: "codex",
    authType: "oauth",
    name: "codex-release-route",
    email: "codex-release@example.com",
    apiKey: null,
    accessToken: "codex-release-access",
    refreshToken: "codex-release-refresh",
    providerSpecificData: {
      codexScopeRateLimitedUntil: {
        codex: "2026-09-29T00:00:00.000Z",
        spark: "2026-09-30T00:00:00.000Z",
      },
      codexScopeRateLimitSource: {
        codex: "quota",
        spark: "quota",
      },
      codexExhaustedWindowByScope: {
        codex: "5h",
        spark: "7d",
      },
      codexQuotaState: { scope: "codex" },
      unrelated: { retained: true },
    },
  }) as Promise<{ id: string }>;
}

test.beforeEach(resetStorage);

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  if (ORIGINAL_INITIAL_PASSWORD === undefined) delete process.env.INITIAL_PASSWORD;
  else process.env.INITIAL_PASSWORD = ORIGINAL_INITIAL_PASSWORD;
  if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
  if (ORIGINAL_API_KEY_SECRET === undefined) delete process.env.API_KEY_SECRET;
  else process.env.API_KEY_SECRET = ORIGINAL_API_KEY_SECRET;
});

test("Codex cooldown release requires management auth", async () => {
  const connection = await seedCodexConnection();
  const response = await route.POST(
    new Request("http://localhost/api/providers/codex-cooldown", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId: connection.id }),
    })
  );
  assert.equal(response.status, 401);
});

test("Codex cooldown release validates the connection id", async () => {
  const response = await route.POST(
    await makeManagementSessionRequest("http://localhost/api/providers/codex-cooldown", {
      method: "POST",
      body: { connectionId: "" },
    })
  );
  assert.equal(response.status, 400);
});

test("Codex cooldown release returns 404 for a missing/non-Codex account", async () => {
  const response = await route.POST(
    await makeManagementSessionRequest("http://localhost/api/providers/codex-cooldown", {
      method: "POST",
      body: { connectionId: "missing-codex-account" },
    })
  );
  assert.equal(response.status, 404);
});

test("Codex cooldown release clears only the Codex child state", async () => {
  const connection = await seedCodexConnection();
  const response = await route.POST(
    await makeManagementSessionRequest("http://localhost/api/providers/codex-cooldown", {
      method: "POST",
      body: { connectionId: connection.id },
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  const persisted = await providersDb.getProviderConnectionById(connection.id);
  assert.ok(persisted);
  const psd = persisted.providerSpecificData as Record<string, unknown>;
  assert.deepEqual(psd.codexScopeRateLimitedUntil, {
    spark: "2026-09-30T00:00:00.000Z",
  });
  assert.deepEqual(psd.codexScopeRateLimitSource, { spark: "quota" });
  assert.deepEqual(psd.codexExhaustedWindowByScope, { spark: "7d" });
  assert.deepEqual(psd.unrelated, { retained: true });
  assert.equal("codexExhaustedWindow" in psd, false);
});
