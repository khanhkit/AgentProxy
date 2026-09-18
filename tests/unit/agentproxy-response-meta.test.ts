import test from "node:test";
import assert from "node:assert/strict";

import {
  attachAgentProxyMetaHeaders,
  buildAgentProxyResponseMetaHeaders,
  buildAgentProxySseMetadataComment,
  formatAgentProxyCost,
  getAgentProxyTokenCounts,
} from "../../src/domain/agentproxyResponseMeta.ts";
import { APP_CONFIG } from "../../src/shared/constants/appConfig.ts";
import { AGENTPROXY_RESPONSE_HEADERS } from "../../src/shared/constants/headers.ts";

test("getAgentProxyTokenCounts normalizes common usage shapes", () => {
  assert.deepEqual(
    getAgentProxyTokenCounts({
      prompt_tokens: 12,
      completion_tokens: 5,
    }),
    { input: 12, output: 5 }
  );
  assert.deepEqual(
    getAgentProxyTokenCounts({
      input_tokens: "9",
      output_tokens: "4",
    }),
    { input: 9, output: 4 }
  );
});

test("buildAgentProxyResponseMetaHeaders formats provider alias, tokens, latency, and cost", () => {
  const headers = buildAgentProxyResponseMetaHeaders({
    provider: "claude",
    model: "claude-sonnet-4-6",
    cacheHit: true,
    latencyMs: 1234.6,
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
    },
    costUsd: 0.00123456789,
  });

  assert.equal(headers["X-AgentProxy-Provider"], "cc");
  assert.equal(headers["X-AgentProxy-Model"], "claude-sonnet-4-6");
  assert.equal(headers["X-AgentProxy-Cache-Hit"], "true");
  assert.equal(headers["X-AgentProxy-Latency-Ms"], "1235");
  assert.equal(headers["X-AgentProxy-Tokens-In"], "11");
  assert.equal(headers["X-AgentProxy-Tokens-Out"], "7");
  assert.equal(headers["X-AgentProxy-Response-Cost"], "0.0012345679");
});

test("buildAgentProxyResponseMetaHeaders keeps ASCII model header values unchanged", () => {
  const headers = buildAgentProxyResponseMetaHeaders({
    provider: "openai",
    model: "gpt-4o-mini",
  });

  assert.equal(headers[AGENTPROXY_RESPONSE_HEADERS.model], "gpt-4o-mini");
});

test("buildAgentProxyResponseMetaHeaders percent-encodes non-ASCII model header values", () => {
  const model = "free-mix/[假流式]gemini-3.7-flash";
  const headers = buildAgentProxyResponseMetaHeaders({
    provider: "openai",
    model,
  });

  assert.equal(headers[AGENTPROXY_RESPONSE_HEADERS.model], encodeURIComponent(model));
  assert.doesNotThrow(() => new Headers(headers));
});

test("buildAgentProxyResponseMetaHeaders strips control characters from string header values", () => {
  const headers = buildAgentProxyResponseMetaHeaders({
    provider: "openai",
    model: "free\r\nX-Injected: yes\u0000-model",
    requestId: "req-1\nreq-2\rreq-3\u0007",
  });

  assert.doesNotMatch(headers[AGENTPROXY_RESPONSE_HEADERS.model], /[\r\n\u0000-\u001f\u007f]/);
  assert.doesNotMatch(headers[AGENTPROXY_RESPONSE_HEADERS.requestId], /[\r\n\u0000-\u001f\u007f]/);
  assert.equal(headers[AGENTPROXY_RESPONSE_HEADERS.model], "freeX-Injected: yes-model");
  assert.equal(headers[AGENTPROXY_RESPONSE_HEADERS.requestId], "req-1req-2req-3");
  assert.doesNotThrow(() => new Headers(headers));
});

test("buildAgentProxyResponseMetaHeaders always emits X-AgentProxy-Version", () => {
  const headers = buildAgentProxyResponseMetaHeaders({ provider: "openai", model: "gpt" });
  assert.equal(headers[AGENTPROXY_RESPONSE_HEADERS.version], APP_CONFIG.version);

  // Even with no provider/model at all, the version is still attached.
  const bare = buildAgentProxyResponseMetaHeaders({});
  assert.equal(bare[AGENTPROXY_RESPONSE_HEADERS.version], APP_CONFIG.version);
});

test("buildAgentProxyResponseMetaHeaders emits X-AgentProxy-Request-Id only when provided", () => {
  const withId = buildAgentProxyResponseMetaHeaders({ model: "gpt", requestId: "req-123" });
  assert.equal(withId[AGENTPROXY_RESPONSE_HEADERS.requestId], "req-123");

  const noId = buildAgentProxyResponseMetaHeaders({ model: "gpt" });
  assert.equal(noId[AGENTPROXY_RESPONSE_HEADERS.requestId], undefined);

  const nullId = buildAgentProxyResponseMetaHeaders({ model: "gpt", requestId: null });
  assert.equal(nullId[AGENTPROXY_RESPONSE_HEADERS.requestId], undefined);

  const blankId = buildAgentProxyResponseMetaHeaders({ model: "gpt", requestId: "   " });
  assert.equal(blankId[AGENTPROXY_RESPONSE_HEADERS.requestId], undefined);
});

test("attachAgentProxyMetaHeaders mutates a Headers instance in place, preserving existing entries", () => {
  const headers = new Headers({ "Content-Type": "application/json" });
  attachAgentProxyMetaHeaders(headers, {
    provider: "openai",
    model: "gpt",
    requestId: "req-abc",
  });

  assert.equal(headers.get("Content-Type"), "application/json");
  assert.equal(headers.get(AGENTPROXY_RESPONSE_HEADERS.version), APP_CONFIG.version);
  assert.equal(headers.get(AGENTPROXY_RESPONSE_HEADERS.requestId), "req-abc");
  assert.equal(headers.get(AGENTPROXY_RESPONSE_HEADERS.model), "gpt");
});

test("attachAgentProxyMetaHeaders mutates a plain record in place, preserving existing entries", () => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  attachAgentProxyMetaHeaders(headers, {
    provider: "openai",
    model: "gpt",
  });

  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers[AGENTPROXY_RESPONSE_HEADERS.version], APP_CONFIG.version);
  assert.equal(headers[AGENTPROXY_RESPONSE_HEADERS.model], "gpt");
  // No requestId provided → header omitted.
  assert.equal(headers[AGENTPROXY_RESPONSE_HEADERS.requestId], undefined);
});

test("buildAgentProxySseMetadataComment emits comment lines compatible with SSE", () => {
  const comment = buildAgentProxySseMetadataComment({
    provider: "openai",
    model: "gpt-4o-mini",
    usage: {
      prompt_tokens: 4,
      completion_tokens: 2,
    },
    latencyMs: 50,
    costUsd: formatAgentProxyCost(0),
  });

  assert.match(comment, /^: x-agentproxy-cache-hit=false/m);
  assert.match(comment, /^: x-agentproxy-provider=openai/m);
  assert.match(comment, /^: x-agentproxy-model=gpt-4o-mini/m);
  assert.match(comment, /^: x-agentproxy-tokens-in=4/m);
  assert.match(comment, /^: x-agentproxy-tokens-out=2/m);
  assert.match(comment, /^: x-agentproxy-response-cost=0\.0000000000/m);
});

test("buildAgentProxyResponseMetaHeaders emits X-AgentProxy-Cost-Saved only when costSavedUsd is provided", () => {
  // Cache HIT: the incremental cost of serving the hit is 0, but the cache saved the
  // original (would-have-been) cost — surfaced via the Cost-Saved header for analytics.
  const hit = buildAgentProxyResponseMetaHeaders({
    provider: "openai",
    model: "gpt-4o",
    cacheHit: true,
    costUsd: 0,
    costSavedUsd: 0.0125,
  });
  assert.equal(hit[AGENTPROXY_RESPONSE_HEADERS.responseCost], "0.0000000000");
  assert.equal(hit[AGENTPROXY_RESPONSE_HEADERS.costSaved], "0.0125000000");

  // A normal response (no costSavedUsd) omits the Cost-Saved header entirely.
  const miss = buildAgentProxyResponseMetaHeaders({
    provider: "openai",
    model: "gpt-4o",
    costUsd: 0.0125,
  });
  assert.equal(miss[AGENTPROXY_RESPONSE_HEADERS.costSaved], undefined);

  // A free-model HIT still emits Cost-Saved (= 0) — it explicitly passed costSavedUsd.
  const freeHit = buildAgentProxyResponseMetaHeaders({
    cacheHit: true,
    costUsd: 0,
    costSavedUsd: 0,
  });
  assert.equal(freeHit[AGENTPROXY_RESPONSE_HEADERS.costSaved], "0.0000000000");
});

test("attachAgentProxyMetaHeaders forwards costSavedUsd onto a Headers bag", () => {
  const headers = new Headers({ "Content-Type": "application/json" });
  attachAgentProxyMetaHeaders(headers, {
    provider: "openai",
    model: "gpt-4o",
    cacheHit: true,
    costUsd: 0,
    costSavedUsd: 0.0125,
  });
  assert.equal(headers.get(AGENTPROXY_RESPONSE_HEADERS.responseCost), "0.0000000000");
  assert.equal(headers.get(AGENTPROXY_RESPONSE_HEADERS.costSaved), "0.0125000000");
});
