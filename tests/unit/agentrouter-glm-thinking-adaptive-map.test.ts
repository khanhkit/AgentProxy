import test from "node:test";
import assert from "node:assert/strict";
import { stripUnsupportedParams } from "../../open-sse/translator/paramSupport.ts";

test("agentrouter GLM maps thinking.type adaptive to enabled", () => {
  const body = {
    thinking: { type: "adaptive", budget_tokens: 1024 },
    max_tokens: 512,
  } as Record<string, unknown>;

  stripUnsupportedParams("agentrouter", "glm-5.3", body);

  assert.deepEqual(body.thinking, { type: "enabled", budget_tokens: 1024 });
  assert.equal(body.max_tokens, 512);
});

test("non-GLM AgentRouter models keep adaptive thinking", () => {
  const body = { thinking: { type: "adaptive" } } as Record<string, unknown>;
  stripUnsupportedParams("agentrouter", "claude-opus-5", body);
  assert.deepEqual(body.thinking, { type: "adaptive" });
});
