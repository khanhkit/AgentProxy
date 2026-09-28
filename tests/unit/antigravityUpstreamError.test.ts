import test from "node:test";
import assert from "node:assert/strict";

import { buildAntigravityUpstreamError } from "../../open-sse/executors/antigravityUpstreamError.ts";

test("Antigravity wrapper surfaces the real parsed upstream message", () => {
  const body = buildAntigravityUpstreamError(
    400,
    "Bad Request",
    JSON.stringify({
      error: {
        code: 400,
        message: "Invalid value at tools[0].function_declarations[0].parameters",
      },
    })
  ) as { error: { message: string } };

  assert.match(body.error.message, /function_declarations/);
});

test("non-JSON Antigravity errors keep the generic status template", () => {
  const body = buildAntigravityUpstreamError(
    502,
    "Bad Gateway",
    "<html>bad gateway</html>"
  ) as { error: { message: string } };

  assert.equal(body.error.message, "Antigravity upstream error (502): Bad Gateway");
});
