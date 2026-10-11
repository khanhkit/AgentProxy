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
    replayAuthority: {
      take: () => ({
        providerReplayKey: "provider-replay-test-key",
        allowCredentialRotation: true,
      }),
      executeRetry: async (permit: { providerReplayKey: string }) => {
        assert.equal(permit.providerReplayKey, "provider-replay-test-key");
        retryCalls += 1;
        return executeRetry();
      },
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

test("flag on fails closed when no replay authority exists", async () => {
  const original = emptyGeminiStream();
  let credentialReads = 0;
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
    getCredentials: async () => {
      credentialReads += 1;
      return { connectionId: "conn-unsafe" };
    },
    applyCredentials: () => undefined,
  });

  assert.equal(credentialReads, 0, "denied replay must not rotate/read another credential");
  assert.equal(returned, original);
  assert.equal(returned.bodyUsed, false, "denied replay must preserve the original body");
});

test("one shared replay permit cannot reset across helper invocations", async () => {
  let permits = 1;
  let authorizedCalls = 0;
  const authority = {
    take: () =>
      permits-- > 0
        ? { providerReplayKey: "provider-shared-replay-key", allowCredentialRotation: false }
        : null,
    executeRetry: async (permit: { providerReplayKey: string }) => {
      assert.equal(permit.providerReplayKey, "provider-shared-replay-key");
      authorizedCalls += 1;
      return {
        response: new Response(
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "safe" }] } }] })}\n\ndata: [DONE]\n\n`,
          { status: 200, headers: { "content-type": "text/event-stream" } }
        ),
      };
    },
  };

  const run = () =>
    maybeRetryFlushEmptyTurn({
      stream: true,
      response: emptyGeminiStream(),
      targetFormat: FORMATS.GEMINI,
      clientResponseFormat: FORMATS.OPENAI,
      timeoutMs: 50,
      maxTimeoutMs: 100,
      provider: "gemini",
      model: "gemini-test",
      currentModel: "gemini-test",
      getCredentials: async () => ({ connectionId: "conn-current" }),
      applyCredentials: () => undefined,
      replayAuthority: authority,
    });

  await run();
  await run();
  assert.equal(
    authorizedCalls,
    1,
    "request-scoped permit must be consumed once across helper calls"
  );
});

test("affinity-preserving replay forwards the provider replay key without credential rotation", async () => {
  let credentialReads = 0;
  let credentialApplies = 0;
  let authorizedCalls = 0;
  const returned = await maybeRetryFlushEmptyTurn({
    stream: true,
    response: emptyGeminiStream(),
    targetFormat: FORMATS.GEMINI,
    clientResponseFormat: FORMATS.OPENAI,
    timeoutMs: 50,
    maxTimeoutMs: 100,
    provider: "gemini",
    model: "gemini-test",
    currentModel: "gemini-test",
    getCredentials: async () => {
      credentialReads += 1;
      return { connectionId: "conn-other" };
    },
    applyCredentials: () => {
      credentialApplies += 1;
    },
    replayAuthority: {
      take: () => ({
        providerReplayKey: "provider-affinity-replay-key",
        allowCredentialRotation: false,
      }),
      executeRetry: async (permit: { providerReplayKey: string }) => {
        assert.equal(permit.providerReplayKey, "provider-affinity-replay-key");
        authorizedCalls += 1;
        return {
          response: new Response(
            `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "safe" }] } }] })}\n\ndata: [DONE]\n\n`,
            { status: 200, headers: { "content-type": "text/event-stream" } }
          ),
        };
      },
    },
  });

  assert.equal(authorizedCalls, 1);
  assert.equal(credentialReads, 0, "affinity-preserving replay must not select another credential");
  assert.equal(credentialApplies, 0, "affinity-preserving replay must not mutate credential state");
  assert.notEqual(returned.bodyUsed, true);
});

test("replay authority cannot change provider replay identity mid-request", async () => {
  const keys = ["provider-stable-key", "provider-drifted-key"];
  let authorizedCalls = 0;
  const returned = await maybeRetryFlushEmptyTurn({
    stream: true,
    response: emptyGeminiStream(),
    targetFormat: FORMATS.GEMINI,
    clientResponseFormat: FORMATS.OPENAI,
    timeoutMs: 50,
    maxTimeoutMs: 100,
    provider: "gemini",
    model: "gemini-test",
    currentModel: "gemini-test",
    getCredentials: async () => ({ connectionId: "conn-current" }),
    applyCredentials: () => undefined,
    replayAuthority: {
      take: () => ({ providerReplayKey: keys.shift() ?? "", allowCredentialRotation: false }),
      executeRetry: async () => {
        authorizedCalls += 1;
        return { response: emptyGeminiStream() };
      },
    },
  });

  assert.equal(
    authorizedCalls,
    1,
    "a changed provider replay identity must fail closed before dispatch"
  );
  assert.equal(returned.bodyUsed, false);
});
