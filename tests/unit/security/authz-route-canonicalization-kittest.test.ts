import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { NextRequest } from "next/server";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-kittest-authz-canon-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_API_KEY_SECRET = process.env.API_KEY_SECRET;
const ORIGINAL_REQUIRE_API_KEY = process.env.REQUIRE_API_KEY;
const ORIGINAL_INITIAL_PASSWORD = process.env.INITIAL_PASSWORD;
const ORIGINAL_DEFAULT_RATE_LIMIT = process.env.DEFAULT_RATE_LIMIT_PER_DAY;

process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "kittest-authz-canon-secret";
process.env.REQUIRE_API_KEY = "true";
process.env.INITIAL_PASSWORD = "kittest-authz-canon-password";
delete process.env.DEFAULT_RATE_LIMIT_PER_DAY;

const core = await import("../../../src/lib/db/core.ts");
const apiKeysDb = await import("../../../src/lib/db/apiKeys.ts");
const costRules = await import("../../../src/domain/costRules.ts");
const rateLimiter = await import("../../../src/shared/utils/rateLimiter.ts");
const { classifyRoute } = await import("../../../src/server/authz/classify.ts");
const { enforceApiKeyPolicy } = await import("../../../src/shared/utils/apiKeyPolicy.ts");
const { runAuthzPipeline } = await import("../../../src/server/authz/pipeline.ts");

rateLimiter.setRateLimiterTestMode(true);

type RouteCase = {
  label: string;
  url: string;
  method: "GET" | "POST";
  normalized: string;
};

const ROUTE_CASES: RouteCase[] = [
  {
    label: "chat canonical internal",
    url: "http://localhost/api/v1/chat/completions",
    method: "POST",
    normalized: "/api/v1/chat/completions",
  },
  {
    label: "chat v1 alias",
    url: "http://localhost/v1/chat/completions",
    method: "POST",
    normalized: "/api/v1/chat/completions",
  },
  {
    label: "chat top-level alias",
    url: "http://localhost/chat/completions",
    method: "POST",
    normalized: "/api/v1/chat/completions",
  },
  {
    label: "chat duplicate v1",
    url: "http://localhost/v1/v1/chat/completions",
    method: "POST",
    normalized: "/api/v1/chat/completions",
  },
  {
    label: "chat trailing slash and query",
    url: "http://localhost/chat/completions/?trace=1",
    method: "POST",
    normalized: "/api/v1/chat/completions",
  },
  {
    label: "responses canonical internal",
    url: "http://localhost/api/v1/responses",
    method: "POST",
    normalized: "/api/v1/responses",
  },
  {
    label: "responses v1 alias",
    url: "http://localhost/v1/responses",
    method: "POST",
    normalized: "/api/v1/responses",
  },
  {
    label: "responses top-level alias",
    url: "http://localhost/responses?trace=1",
    method: "POST",
    normalized: "/api/v1/responses",
  },
  {
    label: "codex alias",
    url: "http://localhost/codex/example",
    method: "POST",
    normalized: "/api/v1/responses",
  },
  {
    label: "models canonical internal",
    url: "http://localhost/api/v1/models",
    method: "GET",
    normalized: "/api/v1/models",
  },
  {
    label: "models v1 alias",
    url: "http://localhost/v1/models",
    method: "GET",
    normalized: "/api/v1/models",
  },
  {
    label: "models top-level alias",
    url: "http://localhost/models/",
    method: "GET",
    normalized: "/api/v1/models",
  },
  {
    label: "models duplicate v1",
    url: "http://localhost/v1/v1/models?trace=1",
    method: "GET",
    normalized: "/api/v1/models",
  },
];

async function resetStorage() {
  apiKeysDb.resetApiKeyState();
  costRules.resetCostData();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  process.env.REQUIRE_API_KEY = "true";
  process.env.INITIAL_PASSWORD = "kittest-authz-canon-password";
  delete process.env.DEFAULT_RATE_LIMIT_PER_DAY;
  globalThis.__agentproxyShutdown = { init: false, shuttingDown: false, activeRequests: 0 };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(() => {
  apiKeysDb.resetApiKeyState();
  costRules.resetCostData();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  restoreEnv("DATA_DIR", ORIGINAL_DATA_DIR);
  restoreEnv("API_KEY_SECRET", ORIGINAL_API_KEY_SECRET);
  restoreEnv("REQUIRE_API_KEY", ORIGINAL_REQUIRE_API_KEY);
  restoreEnv("INITIAL_PASSWORD", ORIGINAL_INITIAL_PASSWORD);
  restoreEnv("DEFAULT_RATE_LIMIT_PER_DAY", ORIGINAL_DEFAULT_RATE_LIMIT);
  globalThis.__agentproxyShutdown = { init: false, shuttingDown: false, activeRequests: 0 };
});

test("TC-AUTHZ-CANON-SEC-001 equivalent client routes classify to the same canonical targets", () => {
  const mismatches: Array<Record<string, unknown>> = [];

  for (const entry of ROUTE_CASES) {
    const pathname = new URL(entry.url).pathname;
    const actual = classifyRoute(pathname, entry.method);
    if (actual.routeClass !== "CLIENT_API" || actual.normalizedPath !== entry.normalized) {
      mismatches.push({
        label: entry.label,
        pathname,
        routeClass: actual.routeClass,
        normalizedPath: actual.normalizedPath,
        expectedNormalizedPath: entry.normalized,
      });
    }
  }

  assert.deepEqual(mismatches, []);
});

test("TC-AUTHZ-CANON-SEC-002 endpoint allowlist denial is invariant across equivalent route forms", async () => {
  const key = await apiKeysDb.createApiKey("KitTest authz restricted", "machine-authz-restricted");
  assert.ok(key?.key);
  await apiKeysDb.updateApiKeyPermissions(key.id, { allowedEndpoints: ["search"] });

  const allowedControl = await enforceApiKeyPolicy(
    new Request("http://localhost/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key.key}` },
    }),
    null
  );
  assert.equal(allowedControl.rejection, null, "search-only key must retain its allowed control");

  const mismatches: Array<Record<string, unknown>> = [];
  for (const entry of ROUTE_CASES) {
    const result = await enforceApiKeyPolicy(
      new Request(entry.url, {
        method: entry.method,
        headers: { Authorization: `Bearer ${key.key}` },
      }),
      null
    );

    if (!result.rejection || result.rejection.status !== 403) {
      mismatches.push({
        label: entry.label,
        pathname: new URL(entry.url).pathname,
        status: result.rejection?.status ?? null,
        bypassed: result.rejection === null,
      });
    }
  }

  assert.deepEqual(
    mismatches,
    [],
    "a search-only key must not bypass endpoint-category restrictions by changing route form"
  );
});

test("TC-AUTHZ-CANON-SEC-003 keyless and valid-key auth outcomes are invariant across route forms", async () => {
  const key = await apiKeysDb.createApiKey("KitTest authz valid", "machine-authz-valid");
  assert.ok(key?.key);

  const keylessMismatches: Array<Record<string, unknown>> = [];
  const validKeyMismatches: Array<Record<string, unknown>> = [];

  for (const entry of ROUTE_CASES) {
    const keyless = await runAuthzPipeline(
      new NextRequest(entry.url, { method: entry.method }),
      { enforce: true }
    );
    let keylessCode: string | null = null;
    if (keyless.status !== 200) {
      try {
        const body = (await keyless.clone().json()) as { error?: { code?: string } };
        keylessCode = body.error?.code ?? null;
      } catch {
        keylessCode = null;
      }
    }
    if (
      keyless.status !== 401 ||
      keyless.headers.get("x-agentproxy-route-class") !== "CLIENT_API" ||
      keylessCode !== "AUTH_002"
    ) {
      keylessMismatches.push({
        label: entry.label,
        status: keyless.status,
        routeClass: keyless.headers.get("x-agentproxy-route-class"),
        code: keylessCode,
      });
    }

    const valid = await runAuthzPipeline(
      new NextRequest(entry.url, {
        method: entry.method,
        headers: { Authorization: `Bearer ${key.key}` },
      }),
      { enforce: true }
    );
    if (valid.status !== 200 || valid.headers.get("x-agentproxy-route-class") !== "CLIENT_API") {
      validKeyMismatches.push({
        label: entry.label,
        status: valid.status,
        routeClass: valid.headers.get("x-agentproxy-route-class"),
      });
    }
  }

  assert.deepEqual(keylessMismatches, [], "keyless auth outcome changed across equivalent routes");
  assert.deepEqual(validKeyMismatches, [], "valid-key auth outcome changed across equivalent routes");
});
