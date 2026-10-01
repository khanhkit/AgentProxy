import test from "node:test";
import assert from "node:assert/strict";

import {
  StreamTracker,
  STREAM_STATES,
  resolveMaxCompletedHistory,
} from "../../src/sse/services/streamState.ts";

test("AP-ISS-0124 StreamTracker fail() from INITIALIZED records FAILED", () => {
  const tracker = new StreamTracker("req-setup-fail");
  assert.equal(tracker.state, STREAM_STATES.INITIALIZED);

  tracker.fail(new Error("credential setup failed"));

  assert.equal(tracker.state, STREAM_STATES.FAILED);
  assert.equal(tracker.error, "credential setup failed");
  assert.equal(tracker.isTerminal(), true);
  assert.equal(tracker.transitions.at(-1)?.from, STREAM_STATES.INITIALIZED);
  assert.equal(tracker.transitions.at(-1)?.to, STREAM_STATES.FAILED);
});

test("AP-ISS-0124 stream history max parser defaults invalid inputs and accepts zero", () => {
  assert.equal(resolveMaxCompletedHistory("unlimited"), 50);
  assert.equal(resolveMaxCompletedHistory(undefined), 50);
  assert.equal(resolveMaxCompletedHistory("-5"), 50);
  assert.equal(resolveMaxCompletedHistory("100"), 100);
  assert.equal(resolveMaxCompletedHistory("0"), 0);
});
