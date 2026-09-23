import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "agentproxy-images-codex-errors-"));
const { handleImageGeneration } = await import("../../open-sse/handlers/imageGeneration.ts");

test("handleImageGeneration (codex) does not mark an ordinary 400 as retryable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "Invalid prompt" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });

  try {
    const result = await handleImageGeneration({
      body: { model: "codex/gpt-5.6-sol", prompt: "kitten" },
      credentials: { accessToken: "codex-token" },
      log: null,
    });
    assert.equal(result.success, false);
    assert.equal(result.status, 400);
    assert.equal(result.retryable, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
