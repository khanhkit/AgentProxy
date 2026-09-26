import test from "node:test";
import assert from "node:assert/strict";

const { applyFingerprint, stripInternalBodyFields } = await import(
  "../../open-sse/config/cliFingerprints.ts"
);

test("stripInternalBodyFields removes AgentProxy-owned markers but keeps client underscore fields", () => {
  const body = {
    model: "gpt-test",
    _agentproxySkipContextRelay: true,
    _agentproxyInternalRequest: "universal-handoff",
    _agentproxyResponsesStore: true,
    _agentproxyFutureMarker: "internal",
    _nativeCodexPassthrough: true,
    _nativeXaiResponsesPassthrough: true,
    _nativeOpenAICompatibleResponsesPassthrough: true,
    _claudeCodeRequiresLowercaseToolNames: true,
    _custom_private: "client-value",
  };

  const result = stripInternalBodyFields(body) as Record<string, unknown>;

  assert.deepEqual(result, {
    model: "gpt-test",
    _custom_private: "client-value",
  });
});

test("Codex CLI fingerprint orders prompt_cache_key before include", () => {
  const body = {
    model: "gpt-5.5-low",
    stream: true,
    input: [{ role: "user", content: "hello" }],
    instructions: "You are Codex.",
    store: false,
    reasoning: { effort: "low" },
    tools: [],
    tool_choice: "auto",
    include: ["reasoning.encrypted_content"],
    prompt_cache_key: "conv-codex",
    service_tier: "priority",
  };

  const result = applyFingerprint("codex", {}, body);
  const orderedKeys = Object.keys(JSON.parse(result.bodyString));

  assert.deepEqual(orderedKeys.slice(0, 10), [
    "model",
    "stream",
    "input",
    "instructions",
    "store",
    "reasoning",
    "prompt_cache_key",
    "tools",
    "tool_choice",
    "include",
  ]);
});
