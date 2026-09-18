import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-auth-login-route-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.JWT_SECRET = "test-jwt-secret-for-login-route";

const ORIGINAL_INITIAL_PASSWORD = process.env.INITIAL_PASSWORD;

const core = await import("../../src/lib/db/core.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const loginRoute = await import("../../src/app/api/auth/login/route.ts");
const managementPassword = await import("../../src/lib/auth/managementPassword.ts");

const originalGetCookieStore = loginRoute.authRouteInternals.getCookieStore;

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  delete process.env.INITIAL_PASSWORD;
}

test.beforeEach(async () => {
  await resetStorage();
  loginRoute.authRouteInternals.getCookieStore = async () => ({
    set() {},
  });
});

test.afterEach(() => {
  loginRoute.authRouteInternals.getCookieStore = originalGetCookieStore;
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (ORIGINAL_INITIAL_PASSWORD === undefined) {
    delete process.env.INITIAL_PASSWORD;
  } else {
    process.env.INITIAL_PASSWORD = ORIGINAL_INITIAL_PASSWORD;
  }
});

test("auth login route returns 400 for malformed JSON bodies", async () => {
  const response = await loginRoute.POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "a��",
    })
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      message: "Invalid request",
      details: [{ field: "body", message: "Invalid JSON body" }],
    },
  });
});

test("auth login route returns needsSetup when no management password is configured", async () => {
  const response = await loginRoute.POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "missing-password" }),
    })
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "No password configured. Complete onboarding first.",
    needsSetup: true,
  });
});

test("auth login route lazily migrates INITIAL_PASSWORD to a persisted hash before validating", async () => {
  process.env.INITIAL_PASSWORD = "bootstrap-secret";
  const setCalls: unknown[][] = [];
  loginRoute.authRouteInternals.getCookieStore = async () => ({
    set: (...args: unknown[]) => setCalls.push(args),
  });

  const response = await loginRoute.POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-proto": "https" },
      body: JSON.stringify({ password: "bootstrap-secret" }),
    })
  );
  const settings = await settingsDb.getSettings();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(setCalls.length, 1);
  assert.equal(managementPassword.isBcryptHash(settings.password), true);
  assert.equal(
    await managementPassword.verifyManagementPassword(
      "bootstrap-secret",
      (settings as Record<string, unknown>).password as string
    ),
    true
  );
});

test("auth login route sets a bounded maxAge on the auth_token cookie (Seg3)", async () => {
  process.env.INITIAL_PASSWORD = "bootstrap-secret";
  const setCalls: unknown[][] = [];
  loginRoute.authRouteInternals.getCookieStore = async () => ({
    set: (...args: unknown[]) => setCalls.push(args),
  });

  const response = await loginRoute.POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "bootstrap-secret" }),
    })
  );

  assert.equal(response.status, 200);
  assert.equal(setCalls.length, 1);
  const [cookieName, , options] = setCalls[0] as [string, string, Record<string, unknown>];
  assert.equal(cookieName, "auth_token");
  // 30 days in seconds — must match the JWT 30d expiry so the cookie is not an open-ended
  // session cookie outliving its token.
  assert.equal(options.maxAge, 60 * 60 * 24 * 30);
  assert.equal(options.httpOnly, true);
  assert.equal(options.path, "/");
});

test("auth login route returns 403 when OIDC password login is disabled", async () => {
  process.env.INITIAL_PASSWORD = "bootstrap-secret";
  await settingsDb.updateSettings({
    requireLogin: true,
    oidcEnabled: true,
    oidcDisablePasswordLogin: true,
  });

  const response = await loginRoute.POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "bootstrap-secret" }),
    })
  );

  assert.equal(response.status, 403);
  const body = (await response.json()) as { error?: string };
  assert.match(body.error || "", /Password login is disabled when OIDC is active/);
});


test("AP-ISS-0005: password auth cookie follows configured HTTPS origin, not spoofed XFP", async () => {
  process.env.INITIAL_PASSWORD = "bootstrap-secret";
  process.env.NEXT_PUBLIC_BASE_URL = "https://trusted.example.test";
  delete process.env.AUTH_COOKIE_SECURE;
  const setCalls: unknown[][] = [];
  loginRoute.authRouteInternals.getCookieStore = async () => ({
    set: (...args: unknown[]) => setCalls.push(args),
  });

  try {
    const response = await loginRoute.POST(
      new Request("http://internal.local/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "attacker.example.test",
          "x-forwarded-proto": "http",
        },
        body: JSON.stringify({ password: "bootstrap-secret" }),
      })
    );

    assert.equal(response.status, 200);
    const [cookieName, , options] = setCalls[0] as [string, string, Record<string, unknown>];
    assert.equal(cookieName, "auth_token");
    assert.equal(options.secure, true);
  } finally {
    delete process.env.NEXT_PUBLIC_BASE_URL;
  }
});

test("AP-ISS-0005: direct HTTP password login stays non-Secure unless override forces it", async () => {
  process.env.INITIAL_PASSWORD = "bootstrap-secret";
  delete process.env.NEXT_PUBLIC_BASE_URL;
  delete process.env.OMNIROUTE_PUBLIC_BASE_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.AUTH_COOKIE_SECURE;
  const setCalls: unknown[][] = [];
  loginRoute.authRouteInternals.getCookieStore = async () => ({
    set: (...args: unknown[]) => setCalls.push(args),
  });

  const direct = await loginRoute.POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "bootstrap-secret" }),
    })
  );
  assert.equal(direct.status, 200);
  assert.equal((setCalls[0]?.[2] as Record<string, unknown>)?.secure, false);

  process.env.AUTH_COOKIE_SECURE = "true";
  setCalls.length = 0;
  const forced = await loginRoute.POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "bootstrap-secret" }),
    })
  );
  assert.equal(forced.status, 200);
  assert.equal((setCalls[0]?.[2] as Record<string, unknown>)?.secure, true);
  delete process.env.AUTH_COOKIE_SECURE;
});
