import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SignJWT } from "jose";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-legacy-ws-perimeter-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_API_KEY_SECRET = process.env.API_KEY_SECRET;
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_BRIDGE_SECRET = process.env.OMNIROUTE_WS_BRIDGE_SECRET;
const ORIGINAL_PEER_STAMP_TOKEN = process.env.OMNIROUTE_PEER_STAMP_TOKEN;

process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "ap-iss-0047-api-key-secret";
process.env.JWT_SECRET = "ap-iss-0047-jwt-secret";
process.env.OMNIROUTE_WS_BRIDGE_SECRET = "ap-iss-0047-bridge-secret";
process.env.OMNIROUTE_PEER_STAMP_TOKEN = "ap-iss-0095-peer-stamp";

const core = await import("../../../src/lib/db/core.ts");
const apiKeysDb = await import("../../../src/lib/db/apiKeys.ts");
const { updateSettings } = await import("../../../src/lib/db/settings.ts");
const route = await import("../../../src/app/api/internal/codex-responses-ws/route.ts");
const { createResponsesWsProxy } = await import("../../../scripts/dev/responses-ws-proxy.mjs");

function resetStorage() {
  apiKeysDb.resetApiKeyState();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

async function sessionToken() {
  return await new SignJWT({ sub: "ap-iss-0047-session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
}

function authenticateRequest({
  requestUrl = "/api/v1/responses",
  headers = {},
}: {
  requestUrl?: string;
  headers?: Record<string, string>;
} = {}) {
  return new Request("http://localhost/api/internal/codex-responses-ws", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-omniroute-ws-bridge-secret": process.env.OMNIROUTE_WS_BRIDGE_SECRET as string,
    },
    body: JSON.stringify({ action: "authenticate", requestUrl, headers }),
  });
}

function trustedBrowserHeaders(origin?: string): Record<string, string> {
  const headers: Record<string, string> = {
    host: "localhost",
    "x-omniroute-peer-ip": `${process.env.OMNIROUTE_PEER_STAMP_TOKEN}|127.0.0.1`,
  };
  if (origin) headers.origin = origin;
  return headers;
}

function createUpgradeSocket() {
  const writes: Buffer[] = [];
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    writable: true,
    destroyed: false,
    writes,
    setNoDelay() {},
    on(event: string, listener: (...args: unknown[]) => void) {
      listeners.set(event, listener);
      return socket;
    },
    write(chunk: string | Buffer) {
      writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    },
    end(chunk?: string | Buffer) {
      if (chunk) writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      socket.writable = false;
      return socket;
    },
    unshift() {},
    destroy() {
      socket.destroyed = true;
    },
    closeForTest() {
      listeners.get("close")?.();
    },
  };
  return socket;
}

async function runAdapterHandshake(
  headers: Record<string, string>,
  requestUrl = "/api/v1/responses"
) {
  let upstreamConnects = 0;
  const proxy = createResponsesWsProxy({
    baseUrl: "http://127.0.0.1:20128",
    bridgeSecret: process.env.OMNIROUTE_WS_BRIDGE_SECRET,
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) =>
      route.POST(new Request(input, init)),
    wsFactory: async () => {
      upstreamConnects += 1;
      throw new Error("upstream must not connect during handshake admission");
    },
    pingIntervalMs: 60_000,
    idleTimeoutMs: 60_000,
  });
  const socket = createUpgradeSocket();
  const request = {
    url: requestUrl,
    headers: {
      host: "localhost",
      upgrade: "websocket",
      "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
      ...headers,
    },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const handled = await proxy.handleUpgrade(request, socket, Buffer.alloc(0));
  const responseText = Buffer.concat(socket.writes).toString("utf8");
  socket.closeForTest();
  return { handled, responseText, upstreamConnects };
}

test.beforeEach(async () => {
  resetStorage();
  await updateSettings({ wsAuth: true });
});

test.after(() => {
  apiKeysDb.resetApiKeyState();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("DATA_DIR", ORIGINAL_DATA_DIR);
  restore("API_KEY_SECRET", ORIGINAL_API_KEY_SECRET);
  restore("JWT_SECRET", ORIGINAL_JWT_SECRET);
  restore("OMNIROUTE_WS_BRIDGE_SECRET", ORIGINAL_BRIDGE_SECRET);
  restore("OMNIROUTE_PEER_STAMP_TOKEN", ORIGINAL_PEER_STAMP_TOKEN);
});

test("wsAuth=true rejects an unauthenticated Responses WebSocket bridge handshake", async () => {
  const response = await route.POST(authenticateRequest());
  const body = (await response.json()) as { error?: { code?: string } };

  assert.equal(response.status, 401);
  assert.equal(body.error?.code, "ws_auth_required");
});

test("wsAuth=true accepts a valid same-origin session-authenticated handshake", async () => {
  const token = await sessionToken();
  const response = await route.POST(
    authenticateRequest({
      headers: {
        ...trustedBrowserHeaders("http://localhost"),
        cookie: `auth_token=${token}`,
      },
    })
  );
  const body = (await response.json()) as { authType?: string; authenticated?: boolean };

  assert.equal(response.status, 200);
  assert.equal(body.authenticated, true);
  assert.equal(body.authType, "session");
});

test("AP-ISS-0095 rejects a valid session from an untrusted browser Origin", async () => {
  const token = await sessionToken();
  const response = await route.POST(
    authenticateRequest({
      headers: {
        ...trustedBrowserHeaders("https://attacker.invalid"),
        cookie: `auth_token=${token}`,
      },
    })
  );
  const body = (await response.json()) as { authType?: string; authenticated?: boolean };

  assert.notEqual(response.status, 200);
  assert.notEqual(body.authenticated, true);
});

test("AP-ISS-0095 preserves session-cookie compatibility when Origin is absent", async () => {
  const token = await sessionToken();
  const response = await route.POST(
    authenticateRequest({
      headers: {
        ...trustedBrowserHeaders(),
        cookie: `auth_token=${token}`,
      },
    })
  );
  const body = (await response.json()) as { authType?: string; authenticated?: boolean };

  assert.equal(response.status, 200);
  assert.equal(body.authenticated, true);
  assert.equal(body.authType, "session");
});

test("AP-ISS-0095 preserves API-key compatibility when Origin is absent", async () => {
  const key = await apiKeysDb.createApiKey("responses-ws-nonbrowser", "machine-ap-iss-0095");
  const response = await route.POST(
    authenticateRequest({
      headers: { authorization: `Bearer ${key.key}` },
    })
  );
  const body = (await response.json()) as { authType?: string; authenticated?: boolean };

  assert.equal(response.status, 200);
  assert.equal(body.authenticated, true);
  assert.equal(body.authType, "api_key");
});

test("AP-ISS-0095 adapter rejects hostile session Origin on every Responses alias before 101 and upstream connect", async () => {
  const token = await sessionToken();
  for (const requestUrl of ["/responses", "/v1/responses", "/api/v1/responses"]) {
    const result = await runAdapterHandshake(
      {
        cookie: `auth_token=${token}`,
        origin: "https://attacker.invalid",
      },
      requestUrl
    );

    assert.equal(result.handled, true, requestUrl);
    assert.doesNotMatch(result.responseText, /101 Switching Protocols/, requestUrl);
    assert.equal(result.upstreamConnects, 0, requestUrl);
  }
});

test("AP-ISS-0095 adapter preserves trusted same-origin session upgrade", async () => {
  const token = await sessionToken();
  const result = await runAdapterHandshake({
    cookie: `auth_token=${token}`,
    origin: "http://localhost",
  });

  assert.equal(result.handled, true);
  assert.match(result.responseText, /101 Switching Protocols/);
  assert.equal(result.upstreamConnects, 0);
});
