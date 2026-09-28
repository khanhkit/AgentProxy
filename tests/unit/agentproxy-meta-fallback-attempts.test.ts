import test from "node:test";
import assert from "node:assert/strict";
import { AGENTPROXY_RESPONSE_HEADERS } from "../../src/shared/constants/headers.ts";
import { buildAgentProxyResponseMetaHeaders } from "../../src/domain/agentproxyResponseMeta.ts";

test("headers constant exposes the fallback-attempts key", () => {
  assert.equal(
    AGENTPROXY_RESPONSE_HEADERS.fallbackAttempts,
    "X-AgentProxy-Fallback-Attempts"
  );
});

test("buildAgentProxyResponseMetaHeaders emits the fallback-attempts count when > 0", () => {
  const h = buildAgentProxyResponseMetaHeaders({ model: "gpt", provider: "openai", fallbackAttempts: 2 });
  assert.equal(h["X-AgentProxy-Fallback-Attempts"], "2");
});

test("buildAgentProxyResponseMetaHeaders omits the header when 0 / absent", () => {
  const none = buildAgentProxyResponseMetaHeaders({ model: "gpt" });
  assert.equal(none["X-AgentProxy-Fallback-Attempts"], undefined);
  const zero = buildAgentProxyResponseMetaHeaders({ model: "gpt", fallbackAttempts: 0 });
  assert.equal(zero["X-AgentProxy-Fallback-Attempts"], undefined);
});
