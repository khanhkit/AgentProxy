import test from "node:test";
import assert from "node:assert/strict";

import { isAntigravityImageQuotaExhausted } from "../../src/sse/services/imageCredentialRetry.ts";

test("only explicit Antigravity quota-exhausted 429 is rotation-eligible", () => {
  assert.equal(
    isAntigravityImageQuotaExhausted("antigravity", {
      success: false,
      status: 429,
      error: { error: { message: "Individual quota reached" } },
    }),
    true
  );

  assert.equal(
    isAntigravityImageQuotaExhausted("antigravity", {
      success: false,
      status: 429,
      error: { error: { message: "too many requests; retry later" } },
    }),
    false
  );

  assert.equal(
    isAntigravityImageQuotaExhausted("openai", {
      success: false,
      status: 429,
      error: { error: { message: "Individual quota reached" } },
    }),
    false
  );
});
