import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-cache-embed-test-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const route = await import("../../src/app/api/settings/cache-config/test-embedding/route.ts");
const originalFetch = globalThis.fetch;

function request(body: unknown): Request {
  const req = new Request("http://localhost/api/settings/cache-config/test-embedding", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // Simulate an observed direct loopback socket peer, not a spoofable Host header.
  Object.defineProperty(req, "ip", { value: "127.0.0.1" });
  return req;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("anonymous request without a verified loopback peer remains unauthorized", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({ data: [{ embedding: [1] }] });
  }) as typeof fetch;
  const response = await route.POST(
    new Request("http://localhost/api/settings/cache-config/test-embedding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openai", model: "text-embedding-3-small" }),
    })
  );
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("dimension constraint is forwarded and a mismatched embedding is rejected", async () => {
  let upstreamBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    upstreamBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ data: [{ embedding: [0.1, 0.2] }] });
  }) as typeof fetch;

  const response = await route.POST(
    request({
      provider: "openai",
      model: "text-embedding-3-small",
      baseUrl: "https://embeddings.example/v1",
      apiKey: "caller-key",
      dimensions: 3,
    })
  );
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(upstreamBody?.dimensions, 3);
  assert.equal(body.ok, false);
});

test("fractional embedding dimensions are rejected before transport", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({ data: [{ embedding: [1] }] });
  }) as typeof fetch;

  const response = await route.POST(
    request({
      provider: "openai",
      model: "text-embedding-3-small",
      baseUrl: "https://embeddings.example/v1",
      apiKey: "caller-key",
      dimensions: 1.5,
    })
  );

  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});

test("caller-supplied baseUrl cannot inherit a stored provider credential", async () => {
  await providersDb.createProviderConnection({
    provider: "openai",
    authType: "apikey",
    apiKey: "saved-provider-secret",
    isActive: true,
    testStatus: "active",
  });

  let authorization: string | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get("authorization");
    return Response.json({ data: [{ embedding: [0.1, 0.2, 0.3] }] });
  }) as typeof fetch;

  const response = await route.POST(
    request({
      provider: "openai",
      model: "text-embedding-3-small",
      baseUrl: "https://attacker.example/v1",
    })
  );
  assert.equal(response.status, 200);
  assert.equal(authorization, null);
});

test("caller-supplied private baseUrl is rejected before transport", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json({ data: [{ embedding: [1] }] });
  }) as typeof fetch;

  const response = await route.POST(
    request({
      provider: "openai",
      model: "text-embedding-3-small",
      baseUrl: "http://169.254.169.254/latest/meta-data",
      apiKey: "caller-key",
    })
  );
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.ok, false);
  assert.equal(calls, 0);
});
