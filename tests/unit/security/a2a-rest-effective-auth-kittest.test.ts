import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-kittest-a2a-auth-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "kittest-a2a-auth-secret";

const core = await import("../../../src/lib/db/core.ts");
const settingsDb = await import("../../../src/lib/db/settings.ts");
const apiKeysDb = await import("../../../src/lib/db/apiKeys.ts");
const featureFlagsDb = await import("../../../src/lib/db/featureFlags.ts");
const tasksRoute = await import("../../../src/app/api/a2a/tasks/route.ts");

const ENV_KEYS = [
  "REQUIRE_API_KEY",
  "AGENTPROXY_API_KEY",
  "AGENTPROXY_API_KEY",
  "CONDUCTOR_HUB_URL",
  "CONDUCTOR_HUB_TOKEN",
  "CONDUCTOR_ORCHESTRATOR_TOKEN",
] as const;
const ORIGINAL_ENV = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
const ORIGINAL_FETCH = globalThis.fetch;

const VALID_BODY = {
  skill: "conductor-cli-claude",
  messages: [{ role: "user", content: "verify effective A2A auth before delegation" }],
  metadata: {
    conductor: {
      repo: { url: "https://example.invalid/repo.git", base_ref: "main" },
      mode: "solo",
      model: "cc/claude-sonnet-5",
    },
  },
};

interface RecordedFetch {
  url: string;
  authorization: string | null;
  method: string;
}

async function resetStorageAndPolicy() {
  core.resetDbInstance();
  apiKeysDb.resetApiKeyState();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  delete process.env.AGENTPROXY_API_KEY;
  delete process.env.AGENTPROXY_API_KEY;
  delete process.env.REQUIRE_API_KEY;
  process.env.CONDUCTOR_HUB_URL = "https://conductor.invalid";
  process.env.CONDUCTOR_HUB_TOKEN = "hub-token-must-not-egress-before-client-auth";
  process.env.CONDUCTOR_ORCHESTRATOR_TOKEN = "orchestrator-token-must-not-egress-before-client-auth";

  await settingsDb.updateSettings({ a2aEnabled: true, requireLogin: false });
  featureFlagsDb.clearAllFeatureFlagOverrides();
}

function installFetchRecorder(): RecordedFetch[] {
  const calls: RecordedFetch[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      authorization: headers.get("authorization"),
      method: String(init?.method || "GET"),
    });
    return new Response(JSON.stringify({ id: "task-kittest-a2a", status: "submitted" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

function request(bearer?: string): Request {
  return new Request("http://localhost/api/a2a/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(VALID_BODY),
  });
}

function assertRejectedBeforeConductor(response: Response, calls: RecordedFetch[]) {
  assert.equal(
    calls.length,
    0,
    `unauthorized request must not reach Conductor; observed status=${response.status}, calls=${JSON.stringify(calls)}`
  );
  assert.ok(
    response.status === 401 || response.status === 403,
    `unauthorized A2A delegation must return 401/403, got ${response.status}`
  );
}

test.beforeEach(async () => {
  globalThis.fetch = ORIGINAL_FETCH;
  await resetStorageAndPolicy();
});

test.after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  for (const key of ENV_KEYS) {
    const value = ORIGINAL_ENV.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("TC-A2A-AUTH-SEC-001 env REQUIRE_API_KEY rejects anonymous delegation before Conductor fetch", async () => {
  process.env.REQUIRE_API_KEY = "true";
  const calls = installFetchRecorder();

  const response = await tasksRoute.POST(request());

  assertRejectedBeforeConductor(response, calls);
});

test("TC-A2A-AUTH-SEC-002 DB REQUIRE_API_KEY override rejects anonymous delegation before Conductor fetch", async () => {
  process.env.REQUIRE_API_KEY = "false";
  featureFlagsDb.setFeatureFlagOverride("REQUIRE_API_KEY", "true");
  const calls = installFetchRecorder();

  const response = await tasksRoute.POST(request());

  assertRejectedBeforeConductor(response, calls);
});

test("TC-A2A-AUTH-REG-003 valid persisted API key reaches synthetic Conductor only after authorization", async () => {
  process.env.REQUIRE_API_KEY = "true";
  const key = await apiKeysDb.createApiKey("KitTest A2A Valid", "kittest-a2a-valid");
  assert.ok(key?.key);
  const calls = installFetchRecorder();

  const response = await tasksRoute.POST(request(key.key));
  const body = (await response.json()) as { conductor_task_id?: string };

  assert.equal(response.status, 201);
  assert.equal(body.conductor_task_id, "task-kittest-a2a");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.url, "https://conductor.invalid/v1/tasks");
  assert.equal(calls[0]?.authorization, "Bearer orchestrator-token-must-not-egress-before-client-auth");
});

test("TC-A2A-AUTH-REG-004 explicit keyless local-first posture remains compatible", async () => {
  process.env.REQUIRE_API_KEY = "false";
  featureFlagsDb.removeFeatureFlagOverride("REQUIRE_API_KEY");
  await settingsDb.updateSettings({ a2aEnabled: true, requireLogin: false });
  const calls = installFetchRecorder();

  const response = await tasksRoute.POST(request());
  const body = (await response.json()) as { conductor_task_id?: string };

  assert.equal(response.status, 201);
  assert.equal(body.conductor_task_id, "task-kittest-a2a");
  assert.equal(calls.length, 1);
});
