import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { shouldRetryStreamEarlyEof } = await import("../../src/sse/handlers/chatHelpers.ts");

test("#12906: empty_response gets exactly one bounded same-connection retry", () => {
  assert.equal(shouldRetryStreamEarlyEof("empty_response", 0), true);
  assert.equal(shouldRetryStreamEarlyEof("empty_response", 1), false);
  assert.equal(shouldRetryStreamEarlyEof("STREAM_EARLY_EOF", 0), true);
  assert.equal(shouldRetryStreamEarlyEof("STREAM_READINESS_TIMEOUT", 0), false);
});

test("#12906: stream propagation preserves empty_response error code", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const source = fs.readFileSync(path.join(root, "open-sse/utils/stream.ts"), "utf8");
  assert.match(source, /emptyStreamError\.code = "empty_response"/);
});

test("#12906: single-model retry decision admits empty_response", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const source = fs.readFileSync(path.join(root, "src/sse/handlers/chat.ts"), "utf8");
  assert.match(source, /result\.errorCode === "empty_response"/);
});
