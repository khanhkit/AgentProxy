import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-ap0006-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.OMNIROUTE_DISABLE_REDIS_AUTH_CACHE = "1";

const ORIGINAL = {
  dataDir: process.env.DATA_DIR,
  jwtSecret: process.env.JWT_SECRET,
  initialPassword: process.env.INITIAL_PASSWORD,
  peerStampToken: process.env.OMNIROUTE_PEER_STAMP_TOKEN,
};

const apiAuth = await import("../../../src/shared/utils/apiAuth.ts");
const ipUtils = await import("../../../src/lib/ipUtils.ts");
const peerContext = await import("../../../src/server/authz/peerContext.ts");
const headers = await import("../../../src/server/authz/headers.ts");
const core = await import("../../../src/lib/db/core.ts");
const settingsDb = await import("../../../src/lib/db/settings.ts");
const loginGuard = await import("../../../src/server/auth/loginGuard.ts");
const loginRoute = await import("../../../src/app/api/auth/login/route.ts");
const { managementPolicy } = await import("../../../src/server/authz/policies/management.ts");

function restoreEnv(name: keyof typeof ORIGINAL, envName: string) {
  const value = ORIGINAL[name];
  if (value === undefined) delete process.env[envName];
  else process.env[envName] = value;
}

function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(() => {
  resetStorage();
  loginGuard.resetLoginGuardForTests();
  delete process.env.JWT_SECRET;
  delete process.env.INITIAL_PASSWORD;
  delete process.env.OMNIROUTE_PEER_STAMP_TOKEN;
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  restoreEnv("jwtSecret", "JWT_SECRET");
  restoreEnv("initialPassword", "INITIAL_PASSWORD");
  restoreEnv("peerStampToken", "OMNIROUTE_PEER_STAMP_TOKEN");
});

test("AP-ISS-0006: forged localhost authority is not loopback without trusted peer context", () => {
  const request = new Request("http://localhost/api/keys", {
    headers: { host: "localhost:20128" },
  });

  assert.equal(apiAuth.isLoopbackRequest(request), false);
});

test("AP-ISS-0006: valid peer stamp controls loopback and proxy-hop locality", () => {
  process.env.OMNIROUTE_PEER_STAMP_TOKEN = "ap0006-stamp";

  const directLoopback = new Request("https://dashboard.example/api/keys", {
    headers: {
      [headers.PEER_IP_HEADER]: "ap0006-stamp|127.0.0.1",
      [headers.VIA_PROXY_HEADER]: "ap0006-stamp|0",
    },
  });
  assert.equal(apiAuth.isLoopbackRequest(directLoopback), true);

  const remote = new Request("http://localhost/api/keys", {
    headers: {
      host: "localhost:20128",
      [headers.PEER_IP_HEADER]: "ap0006-stamp|203.0.113.9",
      [headers.VIA_PROXY_HEADER]: "ap0006-stamp|0",
    },
  });
  assert.equal(apiAuth.isLoopbackRequest(remote), false);

  const loopbackProxyHop = new Request("http://localhost/api/keys", {
    headers: {
      host: "localhost:20128",
      [headers.PEER_IP_HEADER]: "ap0006-stamp|127.0.0.1",
      [headers.VIA_PROXY_HEADER]: "ap0006-stamp|1",
    },
  });
  assert.equal(apiAuth.isLoopbackRequest(loopbackProxyHop), false);
});

test("AP-ISS-0006: missing stamp never promotes a loopback proxy socket via raw XFF", () => {
  const context = {
    request: {
      method: "GET",
      headers: new Headers({ "x-forwarded-for": "203.0.113.17" }),
      url: "https://dashboard.example/api/keys",
      nextUrl: { pathname: "/api/keys" },
      socket: { remoteAddress: "127.0.0.1" },
    },
    classification: {
      routeClass: "MANAGEMENT" as const,
      reason: "management_api" as const,
      normalizedPath: "/api/keys",
    },
    requestId: "req_ap0006_proxy",
  };

  assert.equal(peerContext.requestPeerAddress(context), null);
  assert.equal(peerContext.isLoopbackRequest(context), false);
});

test("AP-ISS-0006: direct socket peer remains usable when no proxy headers are present", () => {
  const context = {
    request: {
      method: "GET",
      headers: new Headers(),
      url: "http://localhost/api/keys",
      nextUrl: { pathname: "/api/keys" },
      socket: { remoteAddress: "127.0.0.1" },
    },
    classification: {
      routeClass: "MANAGEMENT" as const,
      reason: "management_api" as const,
      normalizedPath: "/api/keys",
    },
    requestId: "req_ap0006_direct",
  };

  assert.equal(peerContext.requestPeerAddress(context), "127.0.0.1");
  assert.equal(peerContext.isLoopbackRequest(context), true);
});

test("AP-ISS-0006: no peer means XFF cannot become the client identity", () => {
  const request = {
    headers: new Headers({
      "x-forwarded-for": "203.0.113.20",
      "x-real-ip": "198.51.100.20",
    }),
  };

  assert.equal(ipUtils.getClientIpFromRequest(request), "unknown");
});

test("AP-ISS-0006: forged localhost cannot open fresh management bootstrap for a stamped remote peer", async () => {
  process.env.OMNIROUTE_PEER_STAMP_TOKEN = "ap0006-stamp";
  await settingsDb.updateSettings({ requireLogin: true, password: null, setupComplete: false });

  const out = await managementPolicy.evaluate({
    request: {
      method: "GET",
      headers: new Headers({
        host: "localhost:20128",
        [headers.PEER_IP_HEADER]: "ap0006-stamp|203.0.113.42",
        [headers.VIA_PROXY_HEADER]: "ap0006-stamp|0",
      }),
      url: "http://localhost/api/keys",
      nextUrl: { pathname: "/api/keys" },
    },
    classification: {
      routeClass: "MANAGEMENT",
      reason: "management_api",
      normalizedPath: "/api/keys",
    },
    requestId: "req_ap0006_host",
  });

  assert.equal(out.allow, false);
  if (!out.allow) {
    assert.equal(out.status, 401);
    assert.equal(out.code, "AUTH_001");
  }
});

test("AP-ISS-0006: rotating XFF cannot evade login lockout when no trusted peer exists", async () => {
  process.env.JWT_SECRET = "ap0006-jwt-secret";
  process.env.INITIAL_PASSWORD = "ap0006-correct-password";
  await settingsDb.updateSettings({
    requireLogin: true,
    password: null,
    bruteForceProtection: true,
    setupComplete: true,
  });

  let locked = false;
  for (let i = 0; i < loginGuard.LOGIN_GUARD_TUNABLES.FAILURE_THRESHOLD + 1; i++) {
    const request = new Request("https://dashboard.example/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `203.0.113.${10 + i}`,
      },
      body: JSON.stringify({ password: "wrong-password" }),
    }) as unknown as NextRequest;
    Object.defineProperty(request, "nextUrl", {
      value: new URL("https://dashboard.example/api/auth/login"),
      configurable: true,
    });

    const response = await loginRoute.POST(request);
    if (response.status === 429) {
      locked = true;
      assert.ok(response.headers.get("Retry-After"));
      break;
    }
  }

  assert.equal(
    locked,
    true,
    "rotating untrusted XFF values must still hit one stable lockout bucket"
  );
});
