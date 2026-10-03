import test from "node:test";
import assert from "node:assert/strict";
import { DefaultExecutor } from "../../open-sse/executors/default.ts";
import { BaseExecutor } from "../../open-sse/executors/base.ts";
import { hydrateCompatibleNodeBaseUrlFromNodes } from "../../src/sse/services/compatibleNodeBaseUrl.ts";

test("#13452: unhydrated compatible executors fail closed instead of hitting public APIs", () => {
  assert.throws(
    () => new DefaultExecutor("openai-compatible-chat-test-node").buildUrl("qwen", false, 0, { apiKey: "local" }),
    /baseUrl/
  );
  assert.throws(
    () => new BaseExecutor("openai-compatible-responses-test-node", {}).buildUrl("gpt", true, 0, { apiKey: "local" }),
    /baseUrl/
  );
  assert.throws(
    () => new DefaultExecutor("anthropic-compatible-test-node").buildUrl("claude", true, 0, { apiKey: "local" }),
    /baseUrl/
  );
});

test("#13452: hydrated compatible executor uses only the configured node URL", () => {
  const executor = new DefaultExecutor("openai-compatible-chat-test-node");
  assert.equal(
    executor.buildUrl("qwen", false, 0, {
      apiKey: "local", providerSpecificData: { baseUrl: "http://localhost:11434/v1" },
    }),
    "http://localhost:11434/v1/chat/completions"
  );
});

test("#13452: credential hydration re-joins the compatible provider node", () => {
  const provider = "openai-compatible-chat-11111111-1111-1111-1111-111111111111";
  const hydrated = hydrateCompatibleNodeBaseUrlFromNodes(provider, { accountProxies: [] }, [
    {
      id: provider,
      baseUrl: "http://localhost:11434/v1",
      prefix: "ollama",
      apiType: "chat",
      chatPath: "/chat/completions",
      customHeaders: { "x-local": "1" },
    },
  ]);
  assert.equal(hydrated.baseUrl, "http://localhost:11434/v1");
  assert.equal(hydrated.prefix, "ollama");
  assert.equal(hydrated.chatPath, "/chat/completions");
  assert.deepEqual(hydrated.customHeaders, { "x-local": "1" });
});

test("#13452: existing baseUrl remains authoritative and non-compatible rows are untouched", () => {
  const existing = { baseUrl: "http://manual/v1", prefix: "manual" };
  assert.equal(
    hydrateCompatibleNodeBaseUrlFromNodes(
      "openai-compatible-chat-11111111-1111-1111-1111-111111111111",
      existing,
      [{ id: "ignored", baseUrl: "http://other/v1" }]
    ),
    existing
  );
  const plain = { token: "x" };
  assert.equal(
    hydrateCompatibleNodeBaseUrlFromNodes("openai", plain, [{ id: "openai", baseUrl: "x" }]),
    plain
  );
});
