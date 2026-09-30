import test from "node:test";
import assert from "node:assert/strict";
import {
  FREE_BADGE_STRICT_FLAG,
  isModelFreeBadge,
  providerHasFreeModels,
} from "../../src/shared/utils/freeModels.ts";
import { FEATURE_FLAG_DEFINITIONS } from "../../src/shared/constants/featureFlagDefinitions.ts";

test("AP-ISS-0130 strict free badge removes impossible paid-provider heuristics but preserves valid signals", () => {
  assert.equal(providerHasFreeModels("openai"), false);
  assert.equal(isModelFreeBadge("openai", { id: "gpt-9:free", name: "GPT 9 Free" }), true);
  assert.equal(
    isModelFreeBadge("openai", { id: "gpt-9:free", name: "GPT 9 Free" }, { strict: true }),
    false
  );
  assert.equal(isModelFreeBadge("openai", { id: "promo", free: true }, { strict: true }), true);
  assert.equal(
    isModelFreeBadge(
      "openai-compatible-chat-7f3a",
      { id: "meta-llama/llama-3.3-70b:free" },
      { strict: true }
    ),
    true
  );
});

test("AP-ISS-0130 strict free badge flag is opt-in and registry remains unique", () => {
  const defs = FEATURE_FLAG_DEFINITIONS;
  const def = defs.find((item) => item.key === FREE_BADGE_STRICT_FLAG);
  assert.equal(def?.defaultValue, "false");
  assert.equal(def?.type, "boolean");
  assert.equal(defs.length, 58);
  assert.equal(new Set(defs.map((item) => item.key)).size, 58);
});
