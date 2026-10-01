import test from "node:test";
import assert from "node:assert/strict";
import { computeComboCapabilities } from "../../src/app/api/v1/combos/projectCombo.ts";

const combos = [
  {
    name: "inner-vision",
    strategy: "priority",
    models: [
      { kind: "model", model: "prov-a/vision-model" },
      { kind: "model", model: "prov-b/vision-model" },
    ],
  },
  {
    name: "outer-nested",
    strategy: "priority",
    models: [
      { kind: "combo-ref", comboName: "inner-vision" },
      { kind: "model", model: "prov-d/vision-model" },
    ],
  },
] as const;

const capabilities = (model: string) => ({
  supportsVision: model.endsWith("vision-model") ? (true as const) : (false as const),
  reasoning: false,
});

test("AP-ISS-0130 nested combo refs participate in capability projection", () => {
  const caps = computeComboCapabilities(
    combos[1] as unknown as Record<string, unknown>,
    capabilities,
    combos as unknown as Parameters<typeof computeComboCapabilities>[2]
  );
  assert.equal(caps.multimodal, true);
});

test("AP-ISS-0130 legacy callers without collection stay conservative", () => {
  const caps = computeComboCapabilities(
    combos[1] as unknown as Record<string, unknown>,
    capabilities
  );
  assert.equal(caps.multimodal, false);
});
