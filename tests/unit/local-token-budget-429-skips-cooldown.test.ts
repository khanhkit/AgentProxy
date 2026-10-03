import test from "node:test";
import assert from "node:assert/strict";

const { shouldSkipConnDisable, isRequestScopedUpstreamFailure } =
  await import("../../open-sse/services/combo/comboPredicates.ts");

test("local token-budget 429 is request-scoped and skips connection cooldown", () => {
  assert.equal(
    isRequestScopedUpstreamFailure({ code: "TOKEN_LIMIT_EXCEEDED", type: null }),
    true
  );

  assert.equal(
    shouldSkipConnDisable(
      { status: 429, errorCode: "TOKEN_LIMIT_EXCEEDED" },
      false,
      false,
      "test-provider"
    ),
    true
  );
});
