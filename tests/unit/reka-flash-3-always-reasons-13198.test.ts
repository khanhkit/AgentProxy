import test from "node:test";
import assert from "node:assert/strict";

import { DefaultExecutor } from "../../open-sse/executors/default.ts";

test("reka-flash-3 gets the reasoning token floor without explicit reasoning settings", () => {
  const body = { model: "reka-flash-3", max_tokens: 128 };
  new DefaultExecutor("reka").ensureThinkingBudget(body, "reka-flash-3");
  assert.equal(body.max_tokens, 4096);
});

test("reka-flash keeps the caller token budget", () => {
  const body = { model: "reka-flash", max_tokens: 128 };
  new DefaultExecutor("reka").ensureThinkingBudget(body, "reka-flash");
  assert.equal(body.max_tokens, 128);
});
