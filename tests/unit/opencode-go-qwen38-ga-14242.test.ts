import test from "node:test";
import assert from "node:assert/strict";

import { opencode_goProvider } from "../../open-sse/config/providers/registry/opencode/go/index.ts";
import { resolveModelAlias } from "../../open-sse/services/modelDeprecation.ts";
import { MODEL_SPECS } from "../../src/shared/constants/modelSpecs.ts";

test("OpenCode Go keeps GA qwen3.8-max instead of rewriting to preview", () => {
  assert.equal(
    opencode_goProvider.models?.some((model) => model.id === "qwen3.8-max"),
    true
  );
  assert.equal(resolveModelAlias("qwen3.8-max", "opencode-go"), "qwen3.8-max");
});

test("GA qwen3.8-max owns its model spec instead of aliasing to preview", () => {
  assert.ok(MODEL_SPECS["qwen3.8-max"]);
  assert.equal(
    MODEL_SPECS["qwen3.8-max-preview"]?.aliases?.includes("qwen3.8-max") ?? false,
    false
  );
});
