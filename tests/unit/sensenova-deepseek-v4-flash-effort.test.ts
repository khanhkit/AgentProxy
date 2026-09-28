import test from "node:test";
import assert from "node:assert/strict";

import { sensenovaProvider } from "../../open-sse/config/providers/registry/sensenova/index.ts";
import { sanitizeReasoningEffortForProvider } from "../../open-sse/executors/base/reasoningEffort.ts";

test("SenseNova DeepSeek V4 Flash caps reasoning effort at high", () => {
  const model = sensenovaProvider.models.find((item) => item.id === "deepseek-v4-flash");
  assert.ok(model);
  assert.deepEqual(model.supportedThinkingEfforts, ["none", "low", "medium", "high"]);
  assert.equal(model.supportsXHighEffort, false);

  for (const effort of ["xhigh", "max"]) {
    const out = sanitizeReasoningEffortForProvider(
      { reasoning_effort: effort },
      "sensenova",
      "deepseek-v4-flash"
    ) as { reasoning_effort?: string };
    assert.equal(out.reasoning_effort, "high");
  }
});
