import assert from "node:assert/strict";
import test from "node:test";

process.env.FLUSH_EMPTY_RETRY_ENABLED = "true";

const { maybeRetryFlushEmptyTurn } =
  await import("../../open-sse/handlers/chatCore/flushEmptyRetry.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

function emptyGeminiStream(): Response {
  return new Response(
    `data: ${JSON.stringify({
      candidates: [{ content: { parts: [{ text: "reasoning-only", thought: true }] } }],
    })}\n\n` + `data: ${JSON.stringify({ candidates: [{ finishReason: "STOP" }] })}\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );
}

function unreadableJsonRetry(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("conversion-read-failed"));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

function readinessFailureRetry(): Response {
  return new Response("data: {}\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

async function runFallback(executeRetry: () => Promise<unknown>): Promise<{
  original: Response;
  returned: Response;
  retryCalls: number;
}> {
  const original = emptyGeminiStream();
  let retryCalls = 0;
  const returned = await maybeRetryFlushEmptyTurn({
    stream: true,
    response: original,
    targetFormat: FORMATS.GEMINI,
    clientResponseFormat: FORMATS.OPENAI,
    timeoutMs: 50,
    maxTimeoutMs: 100,
    provider: "gemini",
    model: "gemini-test",
    currentModel: "gemini-test",
    getCredentials: async () => ({ connectionId: "conn-retry" }),
    applyCredentials: () => undefined,
    executeRetry: async () => {
      retryCalls += 1;
      return executeRetry();
    },
  });
  return { original, returned, retryCalls };
}

async function assertUsableFallback(executeRetry: () => Promise<unknown>): Promise<void> {
  const { original, returned, retryCalls } = await runFallback(executeRetry);
  assert.equal(retryCalls, 1, "fixture must reach the retry preparation path");
  assert.equal(returned, original, "fallback should preserve the last known response object");
  assert.equal(
    returned.bodyUsed,
    false,
    "fallback body must remain unread before returning to client"
  );
  const text = await returned.text();
  assert.match(text, /finishReason/u);
}

test("executeRetry throw preserves a readable original response", async () => {
  await assertUsableFallback(async () => {
    throw new Error("retry failed");
  });
});

test("invalid retry response preserves a readable original response", async () => {
  await assertUsableFallback(async () => ({ response: new Response("no", { status: 503 }) }));
});

test("JSON-to-SSE conversion failure preserves a readable original response", async () => {
  await assertUsableFallback(async () => ({ response: unreadableJsonRetry() }));
});

test("stream readiness failure preserves a readable original response", async () => {
  await assertUsableFallback(async () => ({ response: readinessFailureRetry() }));
});
