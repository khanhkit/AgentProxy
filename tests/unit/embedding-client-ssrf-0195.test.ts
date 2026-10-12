import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultEmbeddingGenerator } from "../../open-sse/services/cache/embeddingClient.ts";

test("semantic-cache embedding never sends bearer credentials to cloud metadata", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const generator = createDefaultEmbeddingGenerator({
      embeddingBaseUrl: "http://169.254.169.254/latest/meta-data",
      embeddingApiKey: "secret-cache-key",
      embeddingModel: "text-embedding-test",
    });
    const result = await generator("hello");
    assert.equal(result, null);
    assert.equal(
      fetchCalls,
      0,
      "cloud metadata must be rejected before fetch/Authorization dispatch"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
