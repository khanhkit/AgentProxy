import test from "node:test";
import assert from "node:assert/strict";

const { resolveImageSource, normalizeNanoBananaTaskResult } =
  await import("../../open-sse/handlers/imageGeneration.ts");
const { resolveUpscaleImageSource } =
  await import("../../open-sse/handlers/imageUpscale/shared.ts");

test("#13883: caller-controlled image source cannot relax public-only guard", async () => {
  let fetched = false;
  await assert.rejects(
    () =>
      resolveImageSource("http://127.0.0.1/private.png", {
        guard: "none",
        pinDns: false,
        fetchImpl: async () => {
          fetched = true;
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        },
      }),
    /private|blocked|public|host/i
  );
  assert.equal(fetched, false, "guard must reject before the injected fetch seam runs");
});

test("#13883: NanoBanana result URL is strict public-only even on local-first installs", async () => {
  await assert.rejects(
    () =>
      normalizeNanoBananaTaskResult(
        { response: { resultImageUrl: "http://127.0.0.1/nanobanana.png" } },
        { response_format: "b64_json", prompt: "banana" },
        null
      ),
    /private|blocked|public|host/i
  );
});

test("#13883: upscale source rejects private remote URLs", async () => {
  await assert.rejects(
    () => resolveUpscaleImageSource("http://127.0.0.1/upscale.png"),
    /private|blocked|public|host/i
  );
});
