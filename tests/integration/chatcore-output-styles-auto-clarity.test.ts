import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-output-style-auto-clarity-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.REQUIRE_API_KEY = "false";
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "test-output-style-secret";

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const readCacheDb = await import("../../src/lib/db/readCache.ts");
const compressionDb = await import("../../src/lib/db/compression.ts");
const { handleChatCore } = await import("../../open-sse/handlers/chatCore.ts");
const { resetAllCircuitBreakers } = await import("../../src/shared/utils/circuitBreaker.ts");

const originalFetch = globalThis.fetch;

async function resetStorage() {
  globalThis.fetch = originalFetch;
  resetAllCircuitBreakers();
  readCacheDb.invalidateDbCache();
  await new Promise((resolve) => setTimeout(resolve, 20));
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(resetStorage);
test.after(() => {
  globalThis.fetch = originalFetch;
  core.closeDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function styleInstructionReachesUpstream(
  autoClarity: boolean,
  outputStyles?: Array<{ id: string; level: "lite" | "full" | "ultra" }>
) {
  const provider = "openai";
  const model = "gpt-4";
  await compressionDb.updateCompressionSettings({
    enabled: true,
    defaultMode: "off",
    autoTriggerTokens: 0,
    ...(outputStyles ? { outputStyles } : {}),
    cavemanOutputMode: { enabled: !outputStyles, intensity: "full", autoClarity },
  });
  const connection = await providersDb.createProviderConnection({
    provider,
    apiKey: "test-key",
    isActive: true,
  });
  let capturedBody: { messages?: Array<{ role?: string; content?: string }> } | null = null;
  globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.body) capturedBody = JSON.parse(init.body as string);
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: "ok" } }],
        usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };
  try {
    const result = await handleChatCore({
      body: {
        model,
        stream: false,
        messages: [{ role: "user", content: "Explain this security vulnerability in detail." }],
      },
      modelInfo: { provider, model },
      credentials: { apiKey: "test-key" },
      log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      clientRawRequest: { endpoint: "/v1/chat/completions", headers: new Map() },
      connectionId: connection.id,
      onCredentialsRefreshed: () => {},
      onRequestSuccess: () => {},
      onStreamFailure: () => {},
      onDisconnect: () => {},
      userAgent: "test-agent",
      comboName: null,
    });
    assert.ok(result.success);
    assert.ok(capturedBody);
    return (
      capturedBody.messages?.some(
        (message) => message.role === "system" && /Output Styles/.test(message.content ?? "")
      ) ?? false
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("output styles stay on a security-topic turn when Auto-Clarity is off", async () => {
  assert.equal(await styleInstructionReachesUpstream(false), true);
});

test("Auto-Clarity on keeps output styles off a security-topic turn", async () => {
  assert.equal(await styleInstructionReachesUpstream(true), false);
});

test("Output Styles panel selections stay on a security-topic turn when Auto-Clarity is off", async () => {
  assert.equal(
    await styleInstructionReachesUpstream(false, [
      { id: "terse-prose", level: "full" },
      { id: "less-code", level: "full" },
    ]),
    true
  );
});
