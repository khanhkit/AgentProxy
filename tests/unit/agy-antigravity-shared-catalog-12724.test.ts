import test from "node:test";
import assert from "node:assert/strict";

import {
  ANTIGRAVITY_SHARED_MODELS,
  buildSurfaceCatalog,
} from "../../open-sse/config/antigravitySharedModels.ts";
import { AGY_PUBLIC_MODELS } from "../../open-sse/config/agyModels.ts";
import { ANTIGRAVITY_PUBLIC_MODELS } from "../../open-sse/config/antigravityModelAliases.ts";

const serial = { concurrency: false };

test("shared base has exactly 10 models", serial, () => {
  assert.equal(ANTIGRAVITY_SHARED_MODELS.length, 10);
});

test("agy and antigravity derive identically from the shared base", serial, () => {
  assert.deepEqual([...AGY_PUBLIC_MODELS], [...ANTIGRAVITY_SHARED_MODELS]);
  assert.deepEqual([...ANTIGRAVITY_PUBLIC_MODELS], [...ANTIGRAVITY_SHARED_MODELS]);
});

test("surface catalog supports remove delta", serial, () => {
  const subset = buildSurfaceCatalog(ANTIGRAVITY_SHARED_MODELS, {
    remove: ["gemini-3.7-flash-high"],
  });
  assert.equal(subset.length, 9);
  assert.equal(subset.some((m) => m.id === "gemini-3.7-flash-high"), false);
});

test("surface catalog supports add delta", serial, () => {
  const extended = buildSurfaceCatalog(ANTIGRAVITY_SHARED_MODELS, {
    add: [{ id: "custom-model-v1", name: "Custom Model" }],
  });
  assert.equal(extended.length, 11);
  assert.ok(extended.some((m) => m.id === "custom-model-v1"));
});

test("surface catalog supports add+remove and returns frozen output", serial, () => {
  const mixed = buildSurfaceCatalog(ANTIGRAVITY_SHARED_MODELS, {
    add: [{ id: "custom-model-v1", name: "Custom Model" }],
    remove: ["gemini-3.7-flash-high", "gemini-3.7-flash-medium"],
  });
  assert.equal(mixed.length, 9);
  assert.ok(Object.isFrozen(mixed));
});
