import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeDiscoveredModels } from "../../src/lib/providerModels/modelDiscovery.ts";

test("vLLM max_model_len maps into inputTokenLimit", () => {
  const [model] = normalizeDiscoveredModels([
    { id: "qwen3.8", owned_by: "vllm", max_model_len: 250000 },
  ]);

  assert.equal(model.id, "qwen3.8");
  assert.equal(model.inputTokenLimit, 250000);
});

test("explicit context_length keeps precedence over max_model_len", () => {
  const [model] = normalizeDiscoveredModels([
    { id: "vendor/both", context_length: 262144, max_model_len: 131072 },
  ]);

  assert.equal(model.inputTokenLimit, 262144);
});
