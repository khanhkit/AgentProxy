import assert from "node:assert/strict";
import test from "node:test";

import { discoverVertexExpressModels } from "../../src/lib/providerModels/vertexExpressDiscovery.ts";

test("Vertex Express discovery validates against aiplatform and never leaks the key into the URL", async () => {
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  const result = await discoverVertexExpressModels({
    apiKey: "vertex-express-test-key",
    curatedModels: [
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview (Vertex)" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview (Vertex)" },
    ],
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return new Response("{}", { status: 200 });
    },
  });

  assert.equal(seen.length, 1);
  assert.equal(new URL(seen[0].url).hostname, "aiplatform.googleapis.com");
  assert.equal(seen[0].url.includes("vertex-express-test-key"), false);
  const headers = new Headers(seen[0].init?.headers);
  assert.equal(headers.get("x-goog-api-key"), "vertex-express-test-key");
  assert.deepEqual(result.models.map((model) => model.id), [
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
  ]);
  assert.equal(result.failureStatus, undefined);
});

test("Vertex Express discovery reports rejected keys without falling back to generativelanguage", async () => {
  const urls: string[] = [];
  const result = await discoverVertexExpressModels({
    apiKey: "rejected-key",
    curatedModels: [{ id: "gemini-3.1-pro-preview" }],
    fetchImpl: async (url) => {
      urls.push(url);
      return new Response("{}", { status: 400 });
    },
  });

  assert.equal(urls.length, 1);
  assert.equal(new URL(urls[0]).hostname, "aiplatform.googleapis.com");
  assert.deepEqual(result.models, []);
  assert.equal(result.failureStatus, 400);
  assert.equal(result.unavailable, false);
});
