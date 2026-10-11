import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "ap0193-semantic-read-"));
process.env.DATA_DIR = dir;
const { clearCache, generateSignature, setCachedResponse } =
  await import("../../src/lib/semanticCache.ts");
const { checkSemanticCache } = await import("../../open-sse/handlers/chatCore/semanticCache.ts");
const db = await import("../../src/lib/db/core.ts");

test.after(() => {
  clearCache();
  db.resetDbInstance();
  rmSync(dir, { recursive: true, force: true });
});

test("constrained output request never consumes an unconstrained legacy cache entry", async () => {
  const model = "model-contract-test";
  const messages = [{ role: "user", content: "same prompt" }];
  const apiKeyId = "ap0193-test-key";
  const signature = generateSignature(model, messages, 0, 1, apiKeyId);
  setCachedResponse(signature, model, {
    choices: [{ message: { role: "assistant", content: "plain text" } }],
  });
  const body = {
    messages,
    temperature: 0,
    top_p: 1,
    response_format: { type: "json_object" },
  };
  const hit = await checkSemanticCache({
    semanticCacheEnabled: true,
    body,
    clientRawRequest: null,
    model,
    provider: "openai",
    stream: false,
    reqLogger: { logConvertedResponse() {} },
    effectiveServiceTier: null,
    pendingScope: { id: null, model, provider: "openai", connectionId: null },
    startTime: Date.now(),
    log: null,
    persistAttemptLogs() {},
    apiKeyId,
  });
  assert.equal(hit, null);
});
