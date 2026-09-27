import test from "node:test";
import assert from "node:assert/strict";

const { storeSemanticCacheResponse } = await import("../../open-sse/handlers/chatCore/semanticCacheStore.ts");
const { storeStreamingSemanticCacheResponse } = await import("../../open-sse/handlers/chatCore/streamingSemanticCacheStore.ts");
const { isTruncatedCompletion } = await import("../../src/lib/semanticCache.ts");

function deps(stored: unknown[]) {
  return {
    isCacheableForWrite: () => true,
    isTruncatedCompletion,
    isSmallEnoughForSemanticCache: () => true,
    generateSignature: () => "sig",
    setCachedResponse: (_s: unknown, _m: string, r: unknown) => stored.push(r),
  } as never;
}

test("#12885: non-streaming length-truncated response is not cached", () => {
  const stored: unknown[] = [];
  storeSemanticCacheResponse({
    enabled: true, body: { messages: [], temperature: 0 }, headers: undefined, model: "m",
    translatedResponse: { choices: [{ finish_reason: "length", message: { content: "partial" } }] },
  }, deps(stored));
  assert.equal(stored.length, 0);
});

test("#12885: Claude max_tokens response is not cached", () => {
  assert.equal(isTruncatedCompletion({ stop_reason: "max_tokens" }), true);
  assert.equal(isTruncatedCompletion({ stop_reason: "end_turn" }), false);
});

test("#12885: assembled streaming response truncated by length is not cached", () => {
  const stored: unknown[] = [];
  storeStreamingSemanticCacheResponse({
    enabled: true, streamStatus: 200,
    streamResponseBody: { choices: [{ finish_reason: "length" }], _streamed: true },
    body: { messages: [], temperature: 0 }, headers: undefined, model: "m",
  }, deps(stored));
  assert.equal(stored.length, 0);
});

test("#12885: complete response still caches", () => {
  const stored: unknown[] = [];
  storeSemanticCacheResponse({
    enabled: true, body: { messages: [], temperature: 0 }, headers: undefined, model: "m",
    translatedResponse: { choices: [{ finish_reason: "stop", message: { content: "done" } }] },
  }, deps(stored));
  assert.equal(stored.length, 1);
});
