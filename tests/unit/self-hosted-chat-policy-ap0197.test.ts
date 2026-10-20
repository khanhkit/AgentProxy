import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-selfhost-policy-"));
process.env.DATA_DIR = dir;
process.env.API_KEY_SECRET = "selfhost-policy-secret";
process.env.OMNIROUTE_SELF_HOSTED_PROVIDERS = `
providers:
  - id: local
    kind: local
    baseUrl: https://selfhost.example/v1
    model: llama3
`;
delete process.env.OMNIROUTE_SELF_HOSTED_API_KEY;

const core = await import("../../src/lib/db/core.ts");
const { createApiKey } = await import("../../src/lib/db/apiKeys.ts");
const chatRoute = await import("../../src/app/api/v1/chat/completions/route.ts");
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("self-hosted policy backend exceptions fail closed", async () => {
  const response = await chatRoute.enforceSelfHostedPolicyOrReject(
    new Request("http://localhost/v1/chat/completions"),
    "local/llama3",
    async () => {
      throw new Error("policy backend unavailable");
    }
  );
  assert.ok(response);
  assert.equal(response.status, 503);
});

test.after(() => {
  globalThis.fetch = originalFetch;
  delete process.env.OMNIROUTE_SELF_HOSTED_PROVIDERS;
  core.resetDbInstance();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("self-hosted early dispatch cannot bypass a restricted API-key model policy", async () => {
  const key = await createApiKey("selfhost-restricted", "selfhost-machine", [], {
    modelAccessMode: "restricted",
    allowedModels: ["allowed/model"],
  });
  let upstreamCalls = 0;
  globalThis.fetch = (async () => {
    upstreamCalls += 1;
    return Response.json({
      id: "bypassed",
      choices: [{ message: { role: "assistant", content: "x" } }],
    });
  }) as typeof fetch;

  const response = await chatRoute.POST(
    new Request("http://localhost/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key.key}`,
      },
      body: JSON.stringify({
        model: "local/llama3",
        messages: [{ role: "user", content: "hi" }],
      }),
    })
  );

  assert.notEqual(response.status, 200);
  assert.equal(upstreamCalls, 0, "policy rejection must happen before self-hosted transport");
});
