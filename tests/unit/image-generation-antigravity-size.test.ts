import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-image-size-"));
process.env.DATA_DIR = dir;
const core = await import("../../src/lib/db/core.ts");
const { handleImageGeneration } = await import("../../open-sse/handlers/imageGeneration.ts");

test.after(() => { core.resetDbInstance(); fs.rmSync(dir, { recursive: true, force: true }); });

async function capture(extra: Record<string, unknown>) {
  const originalFetch = globalThis.fetch;
  let upstream: Record<string, unknown> = {};
  const warnings: string[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    upstream = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ response: { candidates: [{ content: { parts: [{ inlineData: { data: "ZmFrZQ==" } }] } }] } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await handleImageGeneration({
      body: { model: "antigravity/gemini-3.1-flash-image-preview", prompt: "x", aspect_ratio: "1:1", ...extra },
      credentials: { accessToken: "token", projectId: "project" },
      log: { info() {}, error() {}, warn(_scope: string, msg: string) { warnings.push(msg); } },
    });
    assert.equal(result.success, true);
    const request = upstream.request as Record<string, unknown>;
    const generationConfig = request.generationConfig as Record<string, unknown>;
    return { imageConfig: generationConfig.imageConfig, warnings };
  } finally { globalThis.fetch = originalFetch; }
}

test("Antigravity omits absent/non-string image_size", async () => {
  assert.deepEqual((await capture({})).imageConfig, { aspectRatio: "1:1" });
  assert.deepEqual((await capture({ image_size: 2 })).imageConfig, { aspectRatio: "1:1" });
});

test("Antigravity forwards valid image_size and clamps unsupported strings", async () => {
  assert.deepEqual((await capture({ image_size: " 4k " })).imageConfig, { aspectRatio: "1:1", imageSize: "4K" });
  const bad = await capture({ image_size: "1024x1024" });
  assert.deepEqual(bad.imageConfig, { aspectRatio: "1:1", imageSize: "1K" });
  assert.equal(bad.warnings.length, 1);
  assert.match(bad.warnings[0], /clamped to 1K/);
});
