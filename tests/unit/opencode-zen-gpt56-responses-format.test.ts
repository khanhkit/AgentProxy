import assert from "node:assert/strict";
import test from "node:test";

import { opencode_zenProvider } from "../../open-sse/config/providers/registry/opencode/zen/index.ts";
import { resolveOpencodeTargetFormat } from "../../open-sse/executors/opencode.ts";

test("opencode-zen GPT-5.6 family routes to the Responses API", () => {
  for (const id of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
    const model = opencode_zenProvider.models.find((item) => item.id === id);
    assert.ok(model);
    assert.equal(model.targetFormat, "openai-responses");
    assert.equal(resolveOpencodeTargetFormat("opencode-zen", id), "openai-responses");
  }
});
