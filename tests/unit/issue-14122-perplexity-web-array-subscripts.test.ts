import test from "node:test";
import assert from "node:assert/strict";
import { cleanResponse } from "../../open-sse/executors/perplexity-web/protocol.ts";

test("citation cleanup preserves array subscripts inside code and tool payloads", () => {
  const input = [
    "Use this [1]",
    "",
    "```python",
    "print(arr[0], arr[12])",
    "```",
    "",
    "`arr[3]`",
    "",
    '<tool>{"arguments":{"code":"print(arr[4])"}}</tool>',
  ].join("\n");

  const cleaned = cleanResponse(input, true);

  assert.match(cleaned, /Use this$/m);
  assert.match(cleaned, /arr\[0\].*arr\[12\]/);
  assert.match(cleaned, /arr\[3\]/);
  assert.match(cleaned, /arr\[4\]/);
});
