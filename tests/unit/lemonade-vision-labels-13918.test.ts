import test from "node:test";
import assert from "node:assert/strict";

import { detectVisionInput } from "../../src/lib/providerModels/modelDiscovery.ts";

test("Lemonade labels[] vision capability is detected", () => {
  assert.equal(
    detectVisionInput({
      id: "Gemma-4-26B-A4B",
      owned_by: "lemonade",
      labels: ["chat", " Vision ", "reasoning", "tool-calling"],
    }),
    true
  );
});

test("labels[] detection is exact and leaves non-vision labels false", () => {
  assert.equal(
    detectVisionInput({ id: "text-only", labels: ["chat", "revision-control"] }),
    false
  );
});
