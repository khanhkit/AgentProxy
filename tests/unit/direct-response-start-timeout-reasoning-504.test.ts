import test from "node:test";
import assert from "node:assert/strict";
import { resolveDirectHeadersTimeoutMs } from "../../open-sse/utils/directResponseStartTimeout.ts";

const HIGH = JSON.stringify({ model: "glm-5.2", reasoning_effort: "high" });
const MAX = JSON.stringify({ model: "glm-5.3", reasoning: { effort: "max" } });
const PLAIN = JSON.stringify({ model: "gpt-4o-mini" });

test("#12906: direct response-start timeout keeps 30s default for ordinary traffic", () => {
  assert.equal(resolveDirectHeadersTimeoutMs({ AGENTPROXY_DIRECT_HEADERS_TIMEOUT_MS: undefined }), 30_000);
  assert.equal(resolveDirectHeadersTimeoutMs({ AGENTPROXY_DIRECT_HEADERS_TIMEOUT_MS: "90000" }, PLAIN), 90_000);
});

test("#12906: high/max reasoning aligns fetch response-start with 180s readiness ceiling", () => {
  assert.equal(resolveDirectHeadersTimeoutMs({ AGENTPROXY_DIRECT_HEADERS_TIMEOUT_MS: undefined }, HIGH), 180_000);
  assert.equal(resolveDirectHeadersTimeoutMs({ AGENTPROXY_DIRECT_HEADERS_TIMEOUT_MS: undefined }, MAX), 180_000);
});

test("#12906: explicit timeout above reasoning ceiling remains the floor", () => {
  assert.equal(resolveDirectHeadersTimeoutMs({ AGENTPROXY_DIRECT_HEADERS_TIMEOUT_MS: "240000" }, HIGH), 240_000);
});
