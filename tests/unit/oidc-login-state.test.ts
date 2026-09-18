import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PEER_IP_HEADER } from "@/server/authz/headers";

// NOTE: Dynamic imports below are used (with comment) solely because the modules read process.env at evaluation time.
// The specifiers are literals. This is the established pattern in this repo's auth tests for env-controlled DB setup.

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-oidc-login-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.JWT_SECRET = "test-jwt-secret-for-oidc-login";

// @ts-ignore - intentional for test harness timing (see note at top)
const core = await import("../../src/lib/db/core.ts");
// @ts-ignore - intentional for test harness timing
const { updateSettings } = await import("@/lib/db/settings");
const localDb = { updateSettings };
// @ts-ignore - intentional for test harness timing
const loginRoute = await import("../../src/app/api/auth/oidc/login/route.ts");

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  delete process.env.JWT_SECRET;
});

async function setupFullOidcSettings() {
  await localDb.updateSettings({
    requireLogin: true,
    password: "",
    oidcEnabled: true,
    oidcIssuer: "https://idp.test",
    oidcClientId: "client-oidc-test",
    oidcClientSecret: "secret-oidc-test",
    oidcRedirectPath: "/api/auth/oidc/callback",
    oidcAllowedSubjects: [],
  });
}

function extractCookieValue(setCookieHeader: string | null, name: string): string | undefined {
  if (!setCookieHeader) return undefined;
  const match = setCookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

test("OIDC login redirect includes a state parameter matching the oidc_state cookie", async () => {
  await setupFullOidcSettings();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    if (url.includes("/.well-known/openid-configuration")) {
      // Force the deterministic fallback authEndpoint path (no live network dependency).
      return new Response("not found", { status: 404 });
    }
    return new Response("not mocked", { status: 404 });
  }) as unknown as typeof fetch;

  try {
    const response = await loginRoute.GET(
      new Request("http://localhost/api/auth/oidc/login", {
        headers: { "x-forwarded-proto": "http" },
      })
    );

    assert.equal(response.status, 307);

    const location = response.headers.get("location");
    assert.ok(location, "redirect must include a Location header");

    const redirectUrl = new URL(location as string);
    const stateInUrl = redirectUrl.searchParams.get("state");
    assert.ok(stateInUrl, "authorization URL must include a state query parameter");

    const setCookieHeader = response.headers.get("set-cookie");
    assert.ok(setCookieHeader, "response must set the oidc_state cookie");

    const stateInCookie = extractCookieValue(setCookieHeader, "oidc_state");
    assert.ok(stateInCookie, "oidc_state cookie must carry a value");

    assert.equal(
      stateInUrl,
      stateInCookie,
      "state parameter in the authorization URL must match the oidc_state cookie value"
    );

    // Basic cookie hygiene (mirrors the callback route's expectations)
    assert.match(setCookieHeader as string, /HttpOnly/i);
    assert.match(setCookieHeader as string, /SameSite=lax/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OIDC login returns 400 without redirecting when OIDC is not configured", async () => {
  await localDb.updateSettings({
    requireLogin: true,
    password: "",
    oidcEnabled: false,
  });

  const response = await loginRoute.GET(new Request("http://localhost/api/auth/oidc/login"));

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("AP-ISS-0005: configured HTTPS origin resists spoofed Host/XFP for OIDC redirect and cookie", async () => {
  await setupFullOidcSettings();
  process.env.NEXT_PUBLIC_BASE_URL = "https://trusted.example.test";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    if (url.includes("/.well-known/openid-configuration")) {
      return new Response("not found", { status: 404 });
    }
    return new Response("not mocked", { status: 404 });
  }) as unknown as typeof fetch;

  try {
    const response = await loginRoute.GET(
      new Request("http://internal.local/api/auth/oidc/login", {
        headers: {
          host: "attacker.example.test",
          "x-forwarded-proto": "http",
        },
      })
    );

    const location = response.headers.get("location");
    assert.ok(location, "OIDC authorization redirect must exist");
    const redirectUri = new URL(location).searchParams.get("redirect_uri");
    assert.equal(redirectUri, "https://trusted.example.test/api/auth/oidc/callback");

    const setCookieHeader = response.headers.get("set-cookie");
    assert.ok(setCookieHeader, "OIDC state cookie must be set");
    assert.match(setCookieHeader, /;\s*Secure(?:;|$)/i);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NEXT_PUBLIC_BASE_URL;
  }
});


test("AP-ISS-0005: trusted stamped proxy origin is honored for OIDC redirect and cookie", async () => {
  await setupFullOidcSettings();
  delete process.env.OMNIROUTE_PUBLIC_BASE_URL;
  delete process.env.NEXT_PUBLIC_BASE_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  process.env.OMNIROUTE_TRUST_PROXY = "true";
  process.env.OMNIROUTE_PEER_STAMP_TOKEN = "oidc-login-test-peer-stamp";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    if (url.includes("/.well-known/openid-configuration")) {
      return new Response("not found", { status: 404 });
    }
    return new Response("not mocked", { status: 404 });
  }) as unknown as typeof fetch;

  try {
    const response = await loginRoute.GET(
      new Request("http://internal.local/api/auth/oidc/login", {
        headers: {
          host: "attacker.example.test",
          "x-forwarded-host": "trusted-proxy.example.test",
          "x-forwarded-proto": "https",
          [PEER_IP_HEADER]: "oidc-login-test-peer-stamp|127.0.0.1",
        },
      })
    );

    const location = response.headers.get("location");
    assert.ok(location, "OIDC authorization redirect must exist");
    assert.equal(
      new URL(location).searchParams.get("redirect_uri"),
      "https://trusted-proxy.example.test/api/auth/oidc/callback"
    );
    assert.match(response.headers.get("set-cookie") || "", /;\s*Secure(?:;|$)/i);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OMNIROUTE_TRUST_PROXY;
    delete process.env.OMNIROUTE_PEER_STAMP_TOKEN;
  }
});
