import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAgentProxyInferenceTelemetry,
  attachAgentProxyTelemetryToPayload,
  attachAgentProxyTelemetryToSseLine,
  parseAgentProxyInferenceTelemetry,
} from "../src/telemetry.js";

test("parseAgentProxyInferenceTelemetry: copies cost, tokens, tok/s, winning model", () => {
  const headers = new Headers({
    "X-AgentProxy-Response-Cost": "0.0123",
    "X-AgentProxy-Tokens-In": "10",
    "X-AgentProxy-Tokens-Out": "200",
    "X-AgentProxy-Tokens-Per-Second": "100.5",
    "X-AgentProxy-Ttft-Ms": "300",
    "X-AgentProxy-Latency-Ms": "2300",
    "X-AgentProxy-Model": "winner-model",
    "X-AgentProxy-Provider": "openai",
  });
  const got = parseAgentProxyInferenceTelemetry(headers);
  assert.equal(got.costUsd, 0.0123);
  assert.equal(got.tokensIn, 10);
  assert.equal(got.tokensOut, 200);
  assert.equal(got.tokensPerSecond, 100.5);
  assert.equal(got.ttftMs, 300);
  assert.equal(got.model, "winner-model");
  assert.equal(got.provider, "openai");
});

test("parseAgentProxyInferenceTelemetry: omits tok/s when header missing (do not invent from latency)", () => {
  const headers = new Headers({
    "X-AgentProxy-Tokens-Out": "200",
    "X-AgentProxy-Latency-Ms": "2000",
  });
  const got = parseAgentProxyInferenceTelemetry(headers);
  assert.equal(got.tokensPerSecond, undefined);
  assert.equal(got.tokensOut, 200);
  const payload = attachAgentProxyTelemetryToPayload(
    { object: "chat.completion", usage: { prompt_tokens: 10, completion_tokens: 200 } },
    got,
  ) as { usage: { tokens_per_second?: number } };
  assert.equal(payload.usage.tokens_per_second, undefined);
});

test("attachAgentProxyTelemetryToPayload: writes usage.tokens_per_second and winning model", () => {
  const got = attachAgentProxyTelemetryToPayload(
    {
      object: "chat.completion",
      model: "combo/auto",
      usage: { prompt_tokens: 10, completion_tokens: 200 },
    },
    { tokensPerSecond: 80, ttftMs: 250, costUsd: 0, model: "gpt-winner" },
  ) as {
    model: string;
    usage: { tokens_per_second: number; ttft_ms: number; cost: number };
  };
  assert.equal(got.model, "gpt-winner");
  assert.equal(got.usage.tokens_per_second, 80);
  assert.equal(got.usage.ttft_ms, 250);
  assert.equal(got.usage.cost, 0);
});

test("attachAgentProxyTelemetryToPayload: does not mutate /v1/models catalog JSON", () => {
  const catalog = { object: "list", data: [{ id: "m1" }] };
  const got = attachAgentProxyTelemetryToPayload(catalog, {
    tokensPerSecond: 99,
    model: "should-not-apply",
  });
  assert.deepEqual(got, catalog);
});

test("attachAgentProxyTelemetryToSseLine: patches terminal usage data line", () => {
  const line =
    'data: {"object":"chat.completion.chunk","usage":{"completion_tokens":200}}';
  const got = attachAgentProxyTelemetryToSseLine(line, { tokensPerSecond: 50 });
  assert.match(got, /"tokens_per_second":50/);
  assert.match(got, /^data: /);
});

test("applyAgentProxyInferenceTelemetry: JSON response gets header tok/s", async () => {
  const response = new Response(
    JSON.stringify({
      object: "chat.completion",
      model: "combo/auto",
      usage: { prompt_tokens: 1, completion_tokens: 20 },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-AgentProxy-Tokens-Per-Second": "40",
        "X-AgentProxy-Model": "winner",
      },
    },
  );
  const next = await applyAgentProxyInferenceTelemetry(response);
  const body = JSON.parse(await next.text()) as {
    model: string;
    usage: { tokens_per_second: number };
  };
  assert.equal(body.model, "winner");
  assert.equal(body.usage.tokens_per_second, 40);
});
