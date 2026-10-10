import test from "node:test";
import assert from "node:assert/strict";

// Cloudflare Workers AI had a chat provider entry (cloudflare-ai) but no image
// registry entry and no dedicated provider handler under
// open-sse/handlers/imageGeneration/providers/, so a cloudflare-ai image-model
// request fell through the format dispatch in imageGeneration.ts to a
// 400/unmatched-format path instead of reaching Workers AI's /ai/run endpoint.
//
// handleImageGeneration is imported statically (not dynamically inside a test) so
// its transitive imports (e.g. the proxy-aware fetch dispatcher) finish installing
// their own globalThis.fetch wrapper before any test reassigns it for mocking —
// a dynamic import after the mock assignment would let that wrapper silently
// clobber the test's mock and hit the real network.
const { getImageProvider } = await import("../../open-sse/config/imageRegistry.ts");
const { handleImageGeneration } = await import("../../open-sse/handlers/imageGeneration.ts");
const { handleCloudflareAiImageGeneration } =
  await import("../../open-sse/handlers/imageGeneration/providers/cloudflareAi.ts");

test("Cloudflare Workers AI is registered as an image provider with a dedicated cloudflare-ai-image format", () => {
  const cfg = getImageProvider("cloudflare-ai");
  assert.ok(cfg, "expected an IMAGE_PROVIDERS entry for cloudflare-ai");
  assert.equal(cfg.id, "cloudflare-ai");
  assert.equal(
    cfg.format,
    "cloudflare-ai-image",
    "Workers AI /ai/run is not OpenAI-compatible, must use its own format"
  );
  assert.equal(cfg.authType, "apikey");
  assert.equal(cfg.authHeader, "bearer");
});

test("Cloudflare Workers AI image provider exposes at least one text-to-image model", () => {
  const cfg = getImageProvider("cloudflare-ai");
  const ids = (cfg?.models || []).map((m) => m.id);
  assert.ok(ids.length > 0, `expected at least one Workers AI image model, got: ${ids.join(", ")}`);
  assert.ok(
    Array.isArray(cfg?.supportedSizes) && cfg.supportedSizes.length > 0,
    "image provider must declare at least one supported size"
  );
});

test("handleImageGeneration rejects a Cloudflare Workers AI request with no Account ID", async () => {
  const result = await handleImageGeneration({
    body: {
      model: "cloudflare-ai/@cf/black-forest-labs/flux-1-schnell",
      prompt: "a red panda",
      n: 1,
    },
    credentials: { apiKey: "test-token" },
    log: null,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 400);
  assert.match(String(result.error), /Account ID/);
});

test("handleImageGeneration rejects Cloudflare Workers AI with no API token before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  try {
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("network must not be reached without a token");
    }) as typeof fetch;

    const result = await handleImageGeneration({
      body: {
        model: "cloudflare-ai/@cf/black-forest-labs/flux-1-schnell",
        prompt: "a red panda",
        n: 1,
      },
      credentials: { providerSpecificData: { accountId: "acct-123" } },
      log: null,
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 401);
    assert.match(String(result.error), /API token/i);
    assert.equal(fetchCalls, 0, "missing credentials must fail before any network call");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare Workers AI bounds a hung fetch with its timeout signal", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let observedSignal: AbortSignal | undefined;
    globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener(
          "abort",
          () => reject(observedSignal?.reason ?? new DOMException("aborted", "AbortError")),
          { once: true }
        );
      });
    }) as typeof fetch;

    const started = Date.now();
    const result = await handleCloudflareAiImageGeneration({
      model: "@cf/black-forest-labs/flux-1-schnell",
      provider: "cloudflare-ai",
      providerConfig: { baseUrl: "https://api.cloudflare.com/client/v4/accounts" },
      body: { prompt: "a red panda" },
      credentials: { apiKey: "test-token", providerSpecificData: { accountId: "acct-123" } },
      log: null,
      timeoutMs: 25,
    });

    assert.ok(observedSignal, "Cloudflare fetch must receive an abort signal");
    assert.equal(observedSignal?.aborted, true, "timeout must abort the hung fetch");
    assert.ok(
      Date.now() - started < 1000,
      "timeout-bound fetch must settle promptly in the focused test"
    );
    assert.equal(result.success, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handleImageGeneration relays caller cancellation into Cloudflare fetch", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const caller = new AbortController();
    let observedSignal: AbortSignal | undefined;
    globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        observedSignal?.addEventListener(
          "abort",
          () => reject(observedSignal?.reason ?? new DOMException("aborted", "AbortError")),
          { once: true }
        );
      });
    }) as typeof fetch;

    const pending = handleImageGeneration({
      body: {
        model: "cloudflare-ai/@cf/black-forest-labs/flux-1-schnell",
        prompt: "a red panda",
      },
      credentials: { apiKey: "test-token", providerSpecificData: { accountId: "acct-123" } },
      log: null,
      signal: caller.signal,
    });
    await Promise.resolve();
    caller.abort(new Error("caller cancelled"));
    const result = await pending;

    assert.ok(observedSignal, "Cloudflare fetch must receive the relayed caller signal");
    assert.equal(observedSignal?.aborted, true);
    assert.equal(result.success, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handleImageGeneration dispatches cloudflare-ai-image format to the Workers AI handler and normalizes the response", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let fetchCalled = false;
    globalThis.fetch = (async (url: string) => {
      fetchCalled = true;
      assert.match(
        String(url),
        /api\.cloudflare\.com\/client\/v4\/accounts\/acct-123\/ai\/run\/@cf\/black-forest-labs\/flux-1-schnell$/
      );
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            result: { image: "ZmFrZS1iYXNlNjQtaW1hZ2U=" },
            success: true,
            errors: [],
            messages: [],
          }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await handleImageGeneration({
      body: {
        model: "cloudflare-ai/@cf/black-forest-labs/flux-1-schnell",
        prompt: "a red panda in the snow",
        n: 1,
      },
      credentials: { apiKey: "test-token", providerSpecificData: { accountId: "acct-123" } },
      log: null,
    });

    assert.equal(fetchCalled, true, "expected the Workers AI handler to call fetch");
    assert.equal(result.success, true, `expected success, got: ${JSON.stringify(result)}`);
    assert.ok(Array.isArray(result.data?.data) && result.data.data.length === 1);
    assert.equal(result.data.data[0].b64_json, "ZmFrZS1iYXNlNjQtaW1hZ2U=");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handleImageGeneration surfaces Cloudflare Workers AI upstream errors without a network 404", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      return {
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            success: false,
            errors: [{ code: 10000, message: "Invalid API Token" }],
          }),
      } as unknown as Response;
    }) as typeof fetch;

    const result = await handleImageGeneration({
      body: {
        model: "cloudflare-ai/@cf/black-forest-labs/flux-1-schnell",
        prompt: "a red panda in the snow",
        n: 1,
      },
      credentials: { apiKey: "bad-token", providerSpecificData: { accountId: "acct-123" } },
      log: null,
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
