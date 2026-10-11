import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-runtime-status-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.REQUIRE_API_KEY = "false";

const core = await import("../../src/lib/db/core.ts");
const settingsRoute = await import("../../src/app/api/settings/route.ts");
const authority = await import("../../src/lib/config/runtimeConfigAuthority.ts");
const { makeManagementSessionRequest } = await import("../helpers/managementSession.ts");

function candidate(
  revision: number,
  settings: Record<string, unknown> = {},
  featureFlagOverrides: Record<string, string> = {}
) {
  return { revision, settings, featureFlagOverrides };
}

test.beforeEach(() => {
  authority.resetRuntimeConfigAuthorityForTests();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("GET /api/settings exposes sanitized desired/active runtime status", async () => {
  await authority.activateRuntimeConfigCandidate(
    candidate(5, { debugMode: false }, { ENABLE_TLS_FINGERPRINT: "false" }),
    {}
  );
  await authority.activateRuntimeConfigCandidate(
    candidate(6, { debugMode: true }, { ENABLE_TLS_FINGERPRINT: "true" }),
    {}
  );

  const request = await makeManagementSessionRequest("http://localhost/api/settings", {
    method: "GET",
  });
  const response = await settingsRoute.GET(request);
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;

  assert.deepEqual(body.runtimeConfigStatus, {
    desiredRevision: 6,
    activeRevision: 5,
    state: "ready",
    restartRequiredKeys: ["ENABLE_TLS_FINGERPRINT"],
    reconcileRevision: null,
    lastError: null,
  });
  assert.equal(typeof body.settingsRevision, "number");
  assert.equal(response.headers.get("etag"), String(body.settingsRevision));
});

test("GET /api/settings never exposes raw activation error detail", async () => {
  await authority.activateRuntimeConfigCandidate(candidate(10, { debugMode: false }), {});
  await assert.rejects(
    authority.activateRuntimeConfigCandidate(candidate(11, { debugMode: true }), {
      applyAtomic: async () => {
        throw new Error("secret-token-should-not-leak");
      },
    }),
    /secret-token-should-not-leak/
  );

  const request = await makeManagementSessionRequest("http://localhost/api/settings", {
    method: "GET",
  });
  const response = await settingsRoute.GET(request);
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(body.runtimeConfigStatus.state, "activation_failed");
  assert.equal(body.runtimeConfigStatus.lastError.revision, 11);
  assert.equal(
    body.runtimeConfigStatus.lastError.message,
    "Runtime configuration activation failed"
  );
  assert.equal(JSON.stringify(body).includes("secret-token-should-not-leak"), false);
});

test("PATCH /api/settings returns runtime status aligned with the committed revision", async () => {
  const request = await makeManagementSessionRequest("http://localhost/api/settings", {
    method: "PATCH",
    body: { debugMode: true },
  });
  const response = await settingsRoute.PATCH(request);
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  const runtimeStatus = body.runtimeConfigStatus as {
    desiredRevision: number;
    activeRevision: number | null;
    state: string;
    restartRequiredKeys: string[];
  };

  assert.equal(runtimeStatus.desiredRevision, body.settingsRevision);
  assert.equal(runtimeStatus.activeRevision, body.settingsRevision);
  assert.equal(runtimeStatus.state, "ready");
  assert.deepEqual(runtimeStatus.restartRequiredKeys, []);
  assert.equal(response.headers.get("etag"), String(body.settingsRevision));
});
