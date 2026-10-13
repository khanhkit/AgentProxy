import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-call-log-backpressure-"));
const BLOCKING_WORKER = path.join(TEST_ROOT, "blocking-worker.cjs");
fs.writeFileSync(
  BLOCKING_WORKER,
  'const { parentPort } = require("node:worker_threads");\nparentPort.on("message", () => {});\n'
);

const writer = await import("../../src/lib/usage/callLogArtifactWriter.ts");
writer.__setCallLogWorkerOverrideForTests({ workerFile: BLOCKING_WORKER, execArgv: [] });

function buildArtifact(id: string): Parameters<typeof writer.writeCallArtifactAsync>[0] {
  return {
    schemaVersion: 5,
    summary: {
      id,
      timestamp: "2026-10-13T00:00:00.000Z",
      method: "POST",
      path: "/v1/chat/completions",
      status: 200,
      model: "test-model",
      requestedModel: null,
      provider: "test-provider",
      account: "test-account",
      connectionId: null,
      duration: 1,
      tokens: {
        in: 1,
        out: 1,
        cacheRead: null,
        cacheWrite: null,
        reasoning: null,
        compressed: null,
      },
      requestType: "chat",
      sourceFormat: "openai",
      targetFormat: "openai",
      apiKeyId: null,
      apiKeyName: null,
      comboName: null,
      comboStepId: null,
      comboExecutionKey: null,
    },
    requestBody: null,
    responseBody: null,
    error: null,
  };
}

test.after(async () => {
  await writer.closeCallLogArtifactWriter(0);
  writer.__setCallLogWorkerOverrideForTests(null);
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

test("call-log artifact writer bounds total active plus queued jobs at 128", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    let settled = 0;
    const writes = Array.from({ length: 131 }, (_, index) =>
      writer.writeCallArtifactAsync(buildArtifact(`bounded-${index}`)).then((result) => {
        settled++;
        return result;
      })
    );

    await Promise.resolve();
    assert.equal(settled, 3, "exactly three writes beyond the 128-job bound must fail open");

    await writer.closeCallLogArtifactWriter(0);
    assert.deepEqual(await Promise.all(writes), Array(131).fill(null));
  } finally {
    console.warn = originalWarn;
  }
});
