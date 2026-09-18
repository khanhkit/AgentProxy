import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-stream-cancel-0066-"));
process.env.DATA_DIR = dataDir;

const { createSSEStream } = await import("../../open-sse/utils/stream.ts");

const encoder = new TextEncoder();

function timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

test("AP-ISS-0066 client cancellation propagates to the upstream source", async () => {
  let cancelReason: unknown;
  let resolveCancelled!: () => void;
  const cancelled = new Promise<void>((resolve) => {
    resolveCancelled = resolve;
  });

  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id: "chatcmpl-cancel-0066",
            object: "chat.completion.chunk",
            model: "test-model",
            choices: [{ index: 0, delta: { content: "hello" }, finish_reason: null }],
          })}\n\n`
        )
      );
    },
    cancel(reason) {
      cancelReason = reason;
      resolveCancelled();
    },
  });

  const transformed = source.pipeThrough(
    createSSEStream({
      mode: "passthrough",
      sourceFormat: "openai",
      provider: "test",
      model: "test-model",
    })
  );

  const reader = transformed.getReader();
  const first = await timeout(reader.read(), 1_000);
  assert.equal(first.done, false, "stream must emit data before cancellation");

  await timeout(reader.cancel("client-cancel-0066"), 1_000);
  await timeout(cancelled, 1_000);
  assert.equal(cancelReason, "client-cancel-0066");

  fs.rmSync(dataDir, { recursive: true, force: true });
});
