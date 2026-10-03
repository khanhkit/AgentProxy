import test from "node:test";
import assert from "node:assert/strict";

import {
  getAllImageModels,
  parseImageModel,
  isRegisteredImageModel,
} from "../../open-sse/config/imageRegistry.ts";

test("Codex GPT-5.6 image models use distinct public catalog ids", () => {
  const ids = getAllImageModels()
    .filter((model) => model.provider === "codex")
    .map((model) => model.id);

  for (const id of [
    "codex/gpt-5.6-sol-image",
    "codex/gpt-5.6-terra-image",
    "codex/gpt-5.6-luna-image",
  ]) {
    assert.ok(ids.includes(id), id);
  }
});

test("Codex image catalog ids resolve to callable upstream ids", () => {
  assert.deepEqual(parseImageModel("codex/gpt-5.6-sol-image"), {
    provider: "codex",
    model: "gpt-5.6-sol",
  });
  assert.equal(isRegisteredImageModel("codex", "gpt-5.6-sol-image"), true);
});
