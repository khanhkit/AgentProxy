import assert from "node:assert/strict";
import test from "node:test";

const ORIGINAL_INITIAL_PASSWORD = process.env.INITIAL_PASSWORD;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_API_KEY_SECRET = process.env.API_KEY_SECRET;

process.env.INITIAL_PASSWORD = "trae-state-auth-initial-password";
process.env.JWT_SECRET = "trae-state-auth-jwt-secret-with-sufficient-length";
process.env.API_KEY_SECRET = "trae-state-auth-api-key-secret";

const settingsDb = await import("../../src/lib/db/settings.ts");
const apiKeysDb = await import("../../src/lib/db/apiKeys.ts");
const route = await import("../../src/app/api/oauth/trae/authorize-state/route.ts");

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function request(authorization?: string): Request {
  const headers = new Headers({
    "x-agentproxy-peer-locality": "loopback",
    origin: "http://127.0.0.1:20128",
    "sec-fetch-site": "same-origin",
  });
  if (authorization) headers.set("authorization", authorization);
  return new Request("http://127.0.0.1:20128/api/oauth/trae/authorize-state", {
    method: "POST",
    headers,
  });
}

test.before(async () => {
  await settingsDb.updateSettings({ requireLogin: true });
});

test.after(async () => {
  await settingsDb.updateSettings({ requireLogin: false });
  restoreEnv("INITIAL_PASSWORD", ORIGINAL_INITIAL_PASSWORD);
  restoreEnv("JWT_SECRET", ORIGINAL_JWT_SECRET);
  restoreEnv("API_KEY_SECRET", ORIGINAL_API_KEY_SECRET);
});

test("Trae authorize-state requires management auth when login protection is enabled", async () => {
  const response = await route.POST(request());
  assert.equal(response.status, 401);
});

test("Trae authorize-state accepts a loopback manage-scoped API key", async () => {
  const key = await apiKeysDb.createApiKey("trae-state-manage", "machine-trae-state", ["manage"]);
  const response = await route.POST(request(`Bearer ${key.key}`));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { state?: string };
  assert.match(body.state ?? "", /^[A-Za-z0-9_-]{40,}$/);
});
