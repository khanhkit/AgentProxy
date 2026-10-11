import test from "node:test";
import assert from "node:assert/strict";

const { resolveVideoJobPollingOverrides } =
  await import("../../open-sse/handlers/videoGeneration.ts");

test("video job overrides cap excessive poll counts and intervals", () => {
  assert.deepEqual(
    resolveVideoJobPollingOverrides({ max_polls: 999999999, poll_interval_ms: 999999999 }),
    { maxPolls: 120, pollIntervalMs: 60000 }
  );
});

test("video job polling rejects invalid overrides and bounds rapid polling", () => {
  assert.deepEqual(resolveVideoJobPollingOverrides({ max_polls: -1, poll_interval_ms: "bad" }), {});
  assert.deepEqual(resolveVideoJobPollingOverrides({ max_polls: 3, poll_interval_ms: 1 }), {
    maxPolls: 3,
    pollIntervalMs: 100,
  });
});
