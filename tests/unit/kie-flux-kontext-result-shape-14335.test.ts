import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "agentproxy-14335-"));

const { handleImageGeneration } = await import("../../open-sse/handlers/imageGeneration.ts");

test("KIE flux/kontext surfaces response.resultImageUrl", async () => {
  const originalFetch = globalThis.fetch;
  let pollUrlSeen = "";

  globalThis.fetch = (async (url: unknown) => {
    const stringUrl = String(url);
    if (stringUrl === "https://api.kie.ai/api/v1/flux/kontext/generate") {
      return new Response(JSON.stringify({ code: 200, data: { taskId: "flux-kontext-task-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (stringUrl.startsWith("https://api.kie.ai/api/v1/flux/kontext/record-info")) {
      pollUrlSeen = stringUrl;
      return new Response(
        JSON.stringify({
          code: 200,
          data: {
            state: "success",
            response: {
              resultImageUrl: "https://example.com/flux-kontext-result.png",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    throw new Error(`Unexpected URL: ${stringUrl}`);
  }) as typeof globalThis.fetch;

  try {
    const result = await handleImageGeneration({
      body: {
        model: "kie/flux/kontext",
        prompt: "a red bicycle leaning on a brick wall",
        size: "1024x1024",
        n: 1,
      },
      credentials: { apiKey: "test-kie-key" },
      log: null,
    });

    assert.ok(pollUrlSeen);
    const images = (result as { data?: { data?: unknown[] } })?.data?.data ?? [];
    assert.equal(images.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("KIE success state with zero image URLs is rejected", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (url: unknown) => {
    const stringUrl = String(url);
    if (stringUrl === "https://api.kie.ai/api/v1/flux/kontext/generate") {
      return new Response(JSON.stringify({ code: 200, data: { taskId: "flux-kontext-task-2" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (stringUrl.startsWith("https://api.kie.ai/api/v1/flux/kontext/record-info")) {
      return new Response(
        JSON.stringify({
          code: 200,
          data: {
            state: "success",
            response: {},
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    throw new Error(`Unexpected URL: ${stringUrl}`);
  }) as typeof globalThis.fetch;

  try {
    const result = await handleImageGeneration({
      body: {
        model: "kie/flux/kontext",
        prompt: "empty response",
        size: "1024x1024",
        n: 1,
      },
      credentials: { apiKey: "test-kie-key" },
      log: null,
    });

    assert.equal((result as { success?: boolean }).success, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
