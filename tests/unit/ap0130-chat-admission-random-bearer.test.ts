import test from "node:test";
import assert from "node:assert/strict";

const { resolveSelfLoopBearer } =
  await import("../../src/shared/middleware/chatAdmissionIdentity.ts");

function withEnv(values: { AGENTPROXY_API_KEY?: string; ROUTER_API_KEY?: string }, fn: () => void) {
  const prevAgent = process.env.AGENTPROXY_API_KEY;
  const prevRouter = process.env.ROUTER_API_KEY;
  try {
    if (values.AGENTPROXY_API_KEY === undefined) delete process.env.AGENTPROXY_API_KEY;
    else process.env.AGENTPROXY_API_KEY = values.AGENTPROXY_API_KEY;
    if (values.ROUTER_API_KEY === undefined) delete process.env.ROUTER_API_KEY;
    else process.env.ROUTER_API_KEY = values.ROUTER_API_KEY;
    fn();
  } finally {
    if (prevAgent === undefined) delete process.env.AGENTPROXY_API_KEY;
    else process.env.AGENTPROXY_API_KEY = prevAgent;
    if (prevRouter === undefined) delete process.env.ROUTER_API_KEY;
    else process.env.ROUTER_API_KEY = prevRouter;
  }
}

test("AP-ISS-0130 self-loop bearer fallback is random and stable per process", () => {
  withEnv({}, () => {
    const first = resolveSelfLoopBearer();
    const second = resolveSelfLoopBearer();
    assert.equal(first, second);
    assert.notEqual(first, "sk_agentproxy");
    assert.ok(first.length >= 32);
  });
});

test("AP-ISS-0130 explicit AgentProxy API key still wins", () => {
  withEnv({ AGENTPROXY_API_KEY: "agent-key", ROUTER_API_KEY: "router-key" }, () => {
    assert.equal(resolveSelfLoopBearer(), "agent-key");
  });
});
