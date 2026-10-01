import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-embed-unknown-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const { createEmbeddingResponse } = await import("../../src/lib/embeddings/service.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("AP-ISS-0124 unknown embedding provider returns the existing diagnostic 400", async () => {
  const response = await createEmbeddingResponse({
    model: "totally-unrecognized-provider-9999/some-model",
    input: "hello world",
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: { message?: string } };
  assert.match(
    body.error?.message ?? "",
    /Unknown embedding provider: totally-unrecognized-provider-9999/
  );
  assert.match(body.error?.message ?? "", /No matching hardcoded or local provider found/);
});

test("AP-ISS-0124 bare embedding model remains an invalid-model 400", async () => {
  const response = await createEmbeddingResponse({
    model: "no-slash-model-name",
    input: "hello world",
  });

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: { message?: string } };
  assert.match(body.error?.message ?? "", /Invalid embedding model/);
});
