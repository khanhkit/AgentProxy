import test from "node:test";
import assert from "node:assert/strict";

const { readResultUrl } = await import("../../open-sse/handlers/videoGeneration/job.ts");

test("video job fallback skips unrelated download links and selects video result", () => {
  assert.equal(
    readResultUrl(
      {
        status: "completed",
        metadata: { download_url: "https://cdn.example.com/debug-report.zip?ref=video.mp4" },
        result: { video_url: "https://cdn.example.com/output.mp4" },
      },
      "metadata.url"
    ),
    "https://cdn.example.com/output.mp4"
  );
});

test("documented provider result path retains signed extensionless URLs", () => {
  assert.equal(
    readResultUrl({ metadata: { url: "https://cdn.example.com/signed?id=123" } }, "metadata.url"),
    "https://cdn.example.com/signed?id=123"
  );
});
