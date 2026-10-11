import assert from "node:assert/strict";
import test from "node:test";

import {
  noteAddedWait,
  readAddedWait,
  runWithAppliedProxyCapture,
  type AddedWaitCause,
} from "../../open-sse/utils/proxyFetchContext.ts";

test("AP-ISS-0194 preserves the last valid cumulative wait after an empty snapshot", () => {
  const sink = { proxy: null };

  runWithAppliedProxyCapture(sink, () => {
    noteAddedWait(125.4, new Set<AddedWaitCause>(["throttle"]));
    assert.deepEqual(readAddedWait(), { ms: 125, cause: "throttle" });

    noteAddedWait(0, new Set<AddedWaitCause>());
    assert.deepEqual(readAddedWait(), { ms: 125, cause: "throttle" });
  });
});

test("AP-ISS-0194 ignores invalid snapshots but accepts a later valid cumulative update", () => {
  const sink = { proxy: null };

  runWithAppliedProxyCapture(sink, () => {
    noteAddedWait(80, new Set<AddedWaitCause>(["park"]));
    noteAddedWait(Number.NaN, new Set<AddedWaitCause>(["throttle"]));
    assert.deepEqual(readAddedWait(), { ms: 80, cause: "park" });

    noteAddedWait(210, new Set<AddedWaitCause>(["throttle", "park"]));
    assert.deepEqual(readAddedWait(), { ms: 210, cause: "throttle+park" });
  });
});
