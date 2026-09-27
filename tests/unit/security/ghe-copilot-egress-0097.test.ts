import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omni-ghe-egress-0097-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.JWT_SECRET = "kitdev8-ap-iss-0097-test-secret";

const core = await import("../../../src/lib/db/core.ts");
const settingsDb = await import("../../../src/lib/db/settings.ts");
const oauthRoute = await import("../../../src/app/api/oauth/[provider]/[action]/route.ts");
const { safeOutboundFetch, SafeOutboundFetchError } = await import(
  "../../../src/shared/network/safeOutboundFetch.ts"
);
const { fetchGheCopilotModels } = await import(
  "../../../open-sse/services/githubCopilotModels.ts"
);

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("AP-ISS-0097: auth-disabled anonymous callers cannot start configurable GHE device flow", async () => {
  await settingsDb.updateSettings({ requireLogin: false });
  let outboundCalled = false;
  globalThis.fetch = async () => {
    outboundCalled = true;
    return Response.json({ device_code: "synthetic", user_code: "synthetic" });
  };

  const request = new Request(
    "http://localhost/api/oauth/ghe-copilot/device-code?gheUrl=https%3A%2F%2F10.0.0.5"
  );
  const response = await oauthRoute.GET(request, {
    params: Promise.resolve({ provider: "ghe-copilot", action: "device-code" }),
  });

  assert.equal(response.status, 401);
  assert.equal(outboundCalled, false, "unauthorized request must fail before GHE egress");
});

test("AP-ISS-0097: auth-disabled anonymous callers cannot poll configurable GHE device flow", async () => {
  await settingsDb.updateSettings({ requireLogin: false });
  let outboundCalled = false;
  globalThis.fetch = async () => {
    outboundCalled = true;
    return Response.json({ access_token: "synthetic" });
  };

  const request = new Request("http://localhost/api/oauth/ghe-copilot/poll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      deviceCode: "synthetic-device-code",
      extraData: { gheUrl: "https://10.0.0.5" },
    }),
  });
  const response = await oauthRoute.POST(request, {
    params: Promise.resolve({ provider: "ghe-copilot", action: "poll" }),
  });

  assert.equal(response.status, 401);
  assert.equal(outboundCalled, false, "unauthorized poll must fail before token egress");
});

test("AP-ISS-0097: block-metadata DNS validation rejects a hostname that resolves to metadata before fetch", async () => {
  let outboundCalled = false;
  globalThis.fetch = async () => {
    outboundCalled = true;
    return Response.json({ ok: true });
  };

  await assert.rejects(
    safeOutboundFetch("https://ghe.example.test/api/v3/user", {
      guard: "block-metadata",
      retry: false,
      pinDns: true,
      dnsLookup: async () => [{ address: "169.254.169.254", family: 4 }],
    }),
    (error: unknown) => {
      assert.equal(error instanceof SafeOutboundFetchError, true);
      assert.equal((error as SafeOutboundFetchError).code, "URL_GUARD_BLOCKED");
      return true;
    }
  );
  assert.equal(outboundCalled, false);
});

test("AP-ISS-0097: model discovery rejects DNS rebinding to metadata before bearer use", async () => {
  let seenAuthorization: string | null = null;
  const models = await fetchGheCopilotModels({
    apiUrl: "https://ghe-models.example.test/copilot",
    token: "synthetic-copilot-token",
    dnsLookup: async () => [{ address: "169.254.169.254", family: 4 }],
    fetchImpl: async (_url, init) => {
      seenAuthorization = new Headers(init?.headers).get("authorization");
      return Response.json({ data: [{ id: "should-not-be-reached" }] });
    },
  });

  assert.deepEqual(models, []);
  assert.equal(seenAuthorization, null);
});

test("AP-ISS-0097: guarded GHE redirect is not followed to a new authority", async () => {
  let calls = 0;
  await assert.rejects(
    safeOutboundFetch("https://10.20.30.40/api/v3/user", {
      guard: "block-metadata",
      pinDns: true,
      retry: false,
      allowRedirect: false,
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, {
          status: 302,
          headers: { location: "https://169.254.169.254/latest/meta-data" },
        });
      },
    }),
    (error: unknown) => {
      assert.equal(error instanceof SafeOutboundFetchError, true);
      assert.equal((error as SafeOutboundFetchError).code, "REDIRECT_BLOCKED");
      return true;
    }
  );
  assert.equal(calls, 1);
});

test("AP-ISS-0097: token-derived metadata endpoint is rejected before bearer-token model fetch", async () => {
  let seenAuthorization: string | null = null;
  const models = await fetchGheCopilotModels({
    apiUrl: "https://169.254.169.254/latest/meta-data",
    token: "synthetic-copilot-token",
    fetchImpl: async (_url, init) => {
      seenAuthorization = new Headers(init?.headers).get("authorization");
      return Response.json({ data: [{ id: "should-not-be-reached" }] });
    },
  });

  assert.deepEqual(models, []);
  assert.equal(seenAuthorization, null, "bearer must not reach metadata-like endpoint");
});

test("AP-ISS-0097: deliberate private enterprise Copilot model endpoint remains compatible", async () => {
  let seenUrl = "";
  const models = await fetchGheCopilotModels({
    apiUrl: "https://10.20.30.40/copilot",
    token: "synthetic-copilot-token",
    fetchImpl: async (url) => {
      seenUrl = String(url);
      return Response.json({ data: [{ id: "ghe-private-model", name: "Private Model" }] });
    },
  });

  assert.equal(seenUrl, "https://10.20.30.40/copilot/models");
  assert.deepEqual(models.map((model) => model.id), ["ghe-private-model"]);
});
