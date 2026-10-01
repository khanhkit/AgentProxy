import test from "node:test";
import assert from "node:assert/strict";

import {
  scoreToken,
  pruneByScore,
} from "../../open-sse/services/compression/ultraHeuristic.ts";

test("polarity and modality words are force-preserved", () => {
  for (const word of ["never", "always", "not", "must", "do", "should", "can"]) {
    assert.equal(scoreToken(word), 1.0, word);
  }
});

test("pruning preserves line boundaries and blank lines", () => {
  const input = "Alpha\n\nBeta";
  const result = pruneByScore(input, 0.9, 0.3);
  assert.equal(result, input);
});
