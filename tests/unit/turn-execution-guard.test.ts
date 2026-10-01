import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireTurnExecution,
  clearTurnExecutionsForTesting,
  createTurnInProgressResult,
  getTurnExecutionSnapshot,
} from "../../open-sse/handlers/chatCore/turnExecutionGuard.ts";
import { wrapReadableStreamWithFinalize } from "../../open-sse/handlers/chatCore/streamFinalize.ts";

test.afterEach(() => clearTurnExecutionsForTesting());

test("#12912: duplicate key is blocked until original release", () => {
  const first = acquireTurnExecution("turn-key");
  const duplicate = acquireTurnExecution("turn-key");
  assert.equal(first.acquired, true);
  assert.equal(duplicate.acquired, false);
  if (duplicate.acquired === false) assert.equal(duplicate.retryCount, 1);
  assert.equal(getTurnExecutionSnapshot("turn-key")?.retryCount, 1);
  first.release();
  const next = acquireTurnExecution("turn-key");
  assert.equal(next.acquired, true);
  next.release();
});

test("#12912: release is idempotent and missing keys bypass the guard", () => {
  const first = acquireTurnExecution("release-key");
  assert.equal(first.acquired, true);
  first.release();
  first.release();
  assert.equal(acquireTurnExecution(null).acquired, true);
  assert.equal(acquireTurnExecution(null).acquired, true);
});

test("#12912: duplicate response is sanitized 409 with retry metadata", async () => {
  const duplicate = createTurnInProgressResult(3);
  assert.equal(duplicate.result.status, 409);
  assert.equal(duplicate.result.errorType, "turn_in_progress");
  assert.equal(duplicate.result.response.headers.get("Retry-After"), "1");
  assert.equal(duplicate.result.response.headers.get("X-AgentProxy-Turn-Retry"), "3");
  const body = await duplicate.result.response.json() as { error?: { type?: string; code?: string } };
  assert.equal(body.error?.type, "turn_in_progress");
  assert.equal(body.error?.code, "turn_in_progress");
});

test("#12912: stream-finalize handoff retains the guard until drain", async () => {
  const first = acquireTurnExecution("stream-key");
  assert.equal(first.acquired, true);
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const upstream = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  const wrapped = wrapReadableStreamWithFinalize(upstream, first.release);
  const reader = wrapped.getReader();
  controller.enqueue(new Uint8Array([1]));
  const firstChunk = await reader.read();
  assert.equal(firstChunk.done, false);
  assert.equal(acquireTurnExecution("stream-key").acquired, false);
  controller.close();
  const done = await reader.read();
  assert.equal(done.done, true);
  const next = acquireTurnExecution("stream-key");
  assert.equal(next.acquired, true);
  next.release();
});
