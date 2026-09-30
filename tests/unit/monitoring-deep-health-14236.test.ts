import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";
import { makeManagementSessionRequest } from "../helpers/managementSession.ts";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-deep-health-"));
process.env.DATA_DIR = TEST_DATA_DIR;
const ORIGINAL_ENABLED = process.env.DEEP_HEALTH_CHECK_ENABLED;
const ORIGINAL_URL = process.env.DEEP_HEALTH_CHECK_URL;
const ORIGINAL_TOKEN = process.env.DEEP_HEALTH_CHECK_TOKEN;

const core = await import("../../src/lib/db/core.ts");
const route = await import("../../src/app/api/monitoring/health/route.ts");
const { probeDeepHealth, DEEP_HEALTH_VERDICT_TTL_MS } =
  await import("../../src/lib/monitoring/observability.ts");

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test.after(() => {
  restoreEnv("DEEP_HEALTH_CHECK_ENABLED", ORIGINAL_ENABLED);
  restoreEnv("DEEP_HEALTH_CHECK_URL", ORIGINAL_URL);
  restoreEnv("DEEP_HEALTH_CHECK_TOKEN", ORIGINAL_TOKEN);
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.afterEach(() => {
  route.__test_resetMonitoringHealthPayloadCache();
  restoreEnv("DEEP_HEALTH_CHECK_ENABLED", ORIGINAL_ENABLED);
  restoreEnv("DEEP_HEALTH_CHECK_URL", ORIGINAL_URL);
  restoreEnv("DEEP_HEALTH_CHECK_TOKEN", ORIGINAL_TOKEN);
});

test("deep probe marks only 502/503 as failover", async () => {
  for (const status of [502, 503]) {
    const verdict = await probeDeepHealth("http://health.example/v1/chat/completions", {
      fetcher: async () => new Response("{}", { status }),
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.failover, true);
    assert.equal(verdict.status, status);
  }

  for (const status of [400, 401, 404, 429, 500]) {
    const verdict = await probeDeepHealth("http://health.example/v1/chat/completions", {
      fetcher: async () => new Response("{}", { status }),
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.failover, false, `HTTP ${status} must not trip failover`);
  }

  const healthy = await probeDeepHealth("http://health.example/v1/chat/completions", {
    fetcher: async () => new Response("{}", { status: 200 }),
  });
  assert.equal(healthy.ok, true);
  assert.equal(healthy.failover, false);
  assert.equal(healthy.status, 200);
  assert.equal(DEEP_HEALTH_VERDICT_TTL_MS, 30_000);
});

test("deep probe posts one-token non-streaming body and optional bearer token", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  const verdict = await probeDeepHealth("https://health.example/v1/chat/completions", {
    token: "deep-secret",
    fetcher: (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response("{}", { status: 200 });
    }) as typeof fetch,
  });

  assert.equal(verdict.ok, true);
  assert.equal(seenUrl, "https://health.example/v1/chat/completions");
  assert.equal(seenInit?.method, "POST");
  assert.equal(new Headers(seenInit?.headers).get("authorization"), "Bearer deep-secret");
  assert.deepEqual(JSON.parse(String(seenInit?.body)), { max_tokens: 1, stream: false });
});

test("deep probe timeout and network failure return fail-open verdicts", async () => {
  const timeout = await probeDeepHealth("http://health.example/v1/chat/completions", {
    timeoutMs: 20,
    fetcher: (() => new Promise<Response>(() => {})) as typeof fetch,
  });
  assert.equal(timeout.ok, false);
  assert.equal(timeout.failover, false);
  assert.equal(timeout.status, null);

  const refused = await probeDeepHealth("http://health.example/v1/chat/completions", {
    timeoutMs: 20,
    fetcher: (async () => {
      throw new Error("connection refused");
    }) as typeof fetch,
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.failover, false);
  assert.equal(refused.status, null);
});

test("anonymous callers never receive deepHealth even when opted in", async () => {
  process.env.DEEP_HEALTH_CHECK_ENABLED = "1";
  process.env.DEEP_HEALTH_CHECK_URL = "http://127.0.0.1:20128/v1/chat/completions";
  route.__test_seedDeepHealthVerdict({ ok: false, failover: true, status: 503 });

  const response = await route.GET(
    new Request("http://localhost/api/monitoring/health?deep=1") as never
  );
  const body = (await response.json()) as Record<string, unknown>;
  assert.ok("status" in body);
  assert.equal("deepHealth" in body, false);
  assert.ok(Object.keys(body).every((key) => key === "status" || key === "setupComplete"));
});

test("management caller needs both the feature flag and ?deep=1", async () => {
  process.env.DEEP_HEALTH_CHECK_URL = "http://127.0.0.1:20128/v1/chat/completions";
  route.__test_seedDeepHealthVerdict({ ok: true, failover: false, status: 200 });

  const withoutFlag = (await makeManagementSessionRequest(
    "http://localhost/api/monitoring/health?deep=1"
  )) as unknown as NextRequest;
  let response = await route.GET(withoutFlag as never);
  let body = (await response.json()) as Record<string, unknown>;
  assert.equal("deepHealth" in body, false);

  process.env.DEEP_HEALTH_CHECK_ENABLED = "1";
  const withoutQuery = (await makeManagementSessionRequest(
    "http://localhost/api/monitoring/health"
  )) as unknown as NextRequest;
  response = await route.GET(withoutQuery as never);
  body = (await response.json()) as Record<string, unknown>;
  assert.equal("deepHealth" in body, false);
});

test("authenticated opted-in caller receives cached deep verdict without changing status", async () => {
  process.env.DEEP_HEALTH_CHECK_ENABLED = "1";
  process.env.DEEP_HEALTH_CHECK_URL = "http://127.0.0.1:20128/v1/chat/completions";
  const seeded = { ok: false, failover: true, status: 503, latencyMs: 12, at: "t" };
  route.__test_seedDeepHealthVerdict(seeded);

  const url = "http://localhost/api/monitoring/health?deep=1";
  const first = (await makeManagementSessionRequest(url)) as unknown as NextRequest;
  const firstResponse = await route.GET(first as never);
  const firstBody = (await firstResponse.json()) as Record<string, unknown>;
  const second = (await makeManagementSessionRequest(url)) as unknown as NextRequest;
  const secondResponse = await route.GET(second as never);
  const secondBody = (await secondResponse.json()) as Record<string, unknown>;

  assert.deepEqual(firstBody.deepHealth, seeded);
  assert.deepEqual(secondBody.deepHealth, seeded);
  assert.equal(secondBody.status, firstBody.status);
});
