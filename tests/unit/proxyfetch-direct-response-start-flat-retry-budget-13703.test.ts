import test from "node:test";
import assert from "node:assert/strict";
import { resolveDirectHeadersTimeoutMs, resolveDirectRetryTimeoutMs } from "../../open-sse/utils/directResponseStartTimeout.ts";
import { proxyFetch } from "../../open-sse/utils/proxyFetch.ts";

test("#13703: fresh retry gets a larger caller-deadline-aware backstop", () => {
  const env = {
    AGENTPROXY_DIRECT_HEADERS_TIMEOUT_MS: "80",
    AGENTPROXY_DIRECT_RESPONSE_RETRY_TIMEOUT_MS: "200",
  };
  assert.equal(resolveDirectHeadersTimeoutMs(env, null, 0, true), 80);
  assert.equal(resolveDirectHeadersTimeoutMs(env, null, 1, true), 200);
  assert.equal(resolveDirectHeadersTimeoutMs(env, null, 1, false), 80);
  assert.equal(resolveDirectRetryTimeoutMs(240, true, env), 240);
});

test("#13703: proxyFetch uses longer timeout only on fresh-socket retry", async () => {
  process.env.AGENTPROXY_DIRECT_HEADERS_TIMEOUT_MS = "80";
  process.env.AGENTPROXY_DIRECT_RESPONSE_RETRY_TIMEOUT_MS = "220";
  const callerSignal = AbortSignal.timeout(500);
  const abortDurations: number[] = [];
  const starts: number[] = [];
  const mockUndici = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const start = Date.now(); starts.push(start);
    return new Promise((_, reject) => {
      init?.signal?.addEventListener("abort", () => {
        abortDurations.push(Date.now() - start);
        reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error("aborted"));
      }, { once: true });
    });
  };
  try {
    await assert.rejects(() => proxyFetch(
      "https://slow-ttfb.example/v1/chat/completions",
      { method: "POST", signal: callerSignal },
      { undiciFetch: mockUndici, nativeFetch: async () => new Response("unused") }
    ));
    assert.equal(starts.length, 2);
    assert.ok(abortDurations[0] >= 60 && abortDurations[0] < 170, String(abortDurations));
    assert.ok(abortDurations[1] >= 170, String(abortDurations));
  } finally {
    delete process.env.AGENTPROXY_DIRECT_HEADERS_TIMEOUT_MS;
    delete process.env.AGENTPROXY_DIRECT_RESPONSE_RETRY_TIMEOUT_MS;
  }
});
