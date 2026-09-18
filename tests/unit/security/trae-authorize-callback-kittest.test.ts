import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-kittest-trae-callback-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_API_KEY_SECRET = process.env.API_KEY_SECRET;

process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "kittest-trae-callback-secret";

const core = await import("../../../src/lib/db/core.ts");
const providersDb = await import("../../../src/lib/db/providers.ts");
const authorizeRoute = await import("../../../src/app/authorize/route.ts");

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function callbackUrl(origin: string, loginTraceID?: string): string {
  const userJwt = JSON.stringify({
    ClientID: "en1oxy7wnw8j9n",
    Token: "KTEST_ACCESS_TOKEN",
    RefreshToken: "KTEST_REFRESH_TOKEN",
    TokenExpireAt: Date.UTC(2026, 5, 6),
    RefreshExpireAt: Date.UTC(2026, 11, 19),
    TokenExpireDuration: 1209600000,
  });
  const userInfo = JSON.stringify({
    UserID: "kittest-user",
    TenantID: "kittest-tenant",
    Region: "US-East",
    AIRegion: "US",
    ScreenName: "KitTest",
    NonPlainTextEmail: "k***t@example.test",
  });
  const url = new URL("/authorize", origin);
  url.searchParams.set("isRedirect", "true");
  url.searchParams.set("scope", "solo");
  url.searchParams.set("host", "https://api-us-east.trae.ai");
  url.searchParams.set("userJwt", userJwt);
  url.searchParams.set("userInfo", userInfo);
  if (loginTraceID !== undefined) url.searchParams.set("loginTraceID", loginTraceID);
  return url.toString();
}

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  restoreEnv("DATA_DIR", ORIGINAL_DATA_DIR);
  restoreEnv("API_KEY_SECRET", ORIGINAL_API_KEY_SECRET);
});

test("TC-OAUTH-CB-SEC-001 remote forged Trae callback cannot persist provider credentials", async () => {
  const before = providersDb.getProviderConnectionsCount();
  assert.equal(before, 0);

  await authorizeRoute.GET(
    new Request(callbackUrl("https://gateway.example.test", "forged-remote-state"))
  );

  const after = providersDb.getProviderConnectionsCount();
  assert.equal(
    after,
    before,
    "a syntactically valid callback from a non-loopback origin must fail before provider persistence"
  );
});

test("TC-OAUTH-CB-SEC-002 callback without server-bound state cannot persist provider credentials", async () => {
  const before = providersDb.getProviderConnectionsCount();
  assert.equal(before, 0);

  await authorizeRoute.GET(new Request(callbackUrl("http://127.0.0.1:20128")));

  const after = providersDb.getProviderConnectionsCount();
  assert.equal(
    after,
    before,
    "a callback with no server-bound state must fail before provider persistence"
  );
});
