import test from "node:test";
import assert from "node:assert/strict";

import { processRtkText } from "../../../open-sse/services/compression/engines/rtk/index.ts";

test("RTK skipFilters preserves repeated structural lines for non-shell tool results", () => {
  const text = [
    '{"row":[1,2,3]},',
    '{"row":[1,2,3]},',
    '{"row":[1,2,3]},',
    '{"row":[1,2,3]},',
    '{"tail":true}',
  ].join("\n");

  const result = processRtkText(text, {
    command: "grep row data.json",
    skipFilters: true,
    config: {
      deduplicateThreshold: 2,
      maxLinesPerResult: 100,
      maxCharsPerResult: 10000,
    },
  });

  assert.equal(result.text, text);
  assert.equal(result.rulesApplied.includes("rtk:dedup"), false);
});
