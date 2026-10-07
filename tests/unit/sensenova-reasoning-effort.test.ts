import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeReasoningEffortForProvider } from "../../open-sse/executors/base/reasoningEffort.ts";

test("sensenova models without an explicit effort list keep max unchanged", () => {
  const result = sanitizeReasoningEffortForProvider(
    { reasoning_effort: "max", messages: [] },
    "sensenova",
    "glm-5.2"
  );

  assert.equal((result as Record<string, unknown>).reasoning_effort, "max");
});
