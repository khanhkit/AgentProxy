import test from "node:test";
import assert from "node:assert/strict";

process.env.DATA_DIR = `/tmp/agentproxy-test-13927-${Date.now()}`;

const { getComboVisionBridgeDecision } = await import(
  "../../src/lib/guardrails/visionBridge.ts"
);
const combosDb = await import("../../src/lib/db/combos.ts");
const core = await import("../../src/lib/db/core.ts");

test.after(() => {
  core.resetDbInstance();
});

test("nested combo-ref to all-vision leaves resolves to skip", async () => {
  await combosDb.createCombo({
    name: "inner-vision-combo-13927",
    models: [{ providerId: "command-code", model: "gpt-5.5", weight: 1 }],
  });
  await combosDb.createCombo({
    name: "outer-vision-combo-13927",
    models: [{ kind: "combo-ref", comboName: "inner-vision-combo-13927" }],
  });

  assert.equal(await getComboVisionBridgeDecision("inner-vision-combo-13927"), "skip");
  assert.equal(await getComboVisionBridgeDecision("outer-vision-combo-13927"), "skip");
});

test("nested combo-ref to mixed leaves resolves to process", async () => {
  await combosDb.createCombo({
    name: "inner-mixed-combo-13927",
    models: [
      { providerId: "command-code", model: "gpt-5.5", weight: 1 },
      { providerId: "mistral", model: "mistral-large-latest", weight: 1 },
    ],
  });
  await combosDb.createCombo({
    name: "outer-mixed-combo-13927",
    models: [{ kind: "combo-ref", comboName: "inner-mixed-combo-13927" }],
  });

  assert.equal(await getComboVisionBridgeDecision("outer-mixed-combo-13927"), "process");
});

test("nested combo-ref to zero-vision leaves resolves to no-vision", async () => {
  await combosDb.createCombo({
    name: "inner-zero-vision-combo-13927",
    models: [{ providerId: "mistral", model: "mistral-large-latest", weight: 1 }],
  });
  await combosDb.createCombo({
    name: "outer-zero-vision-combo-13927",
    models: [{ kind: "combo-ref", comboName: "inner-zero-vision-combo-13927" }],
  });

  assert.equal(await getComboVisionBridgeDecision("outer-zero-vision-combo-13927"), "no-vision");
});

test("circular combo-ref chain terminates conservatively", async () => {
  await combosDb.createCombo({
    name: "circular-a-13927",
    models: [{ kind: "combo-ref", comboName: "circular-b-13927" }],
  });
  await combosDb.createCombo({
    name: "circular-b-13927",
    models: [{ kind: "combo-ref", comboName: "circular-a-13927" }],
  });

  assert.equal(await getComboVisionBridgeDecision("circular-a-13927"), "no-vision");
});

test("circular combo-ref plus a vision leaf resolves to process", async () => {
  await combosDb.createCombo({
    name: "circular-c-13927",
    models: [{ kind: "combo-ref", comboName: "circular-d-13927" }],
  });
  await combosDb.createCombo({
    name: "circular-d-13927",
    models: [{ kind: "combo-ref", comboName: "circular-c-13927" }],
  });
  await combosDb.createCombo({
    name: "outer-circular-mixed-combo-13927",
    models: [
      { providerId: "command-code", model: "gpt-5.5", weight: 1 },
      { kind: "combo-ref", comboName: "circular-c-13927" },
    ],
  });

  assert.equal(
    await getComboVisionBridgeDecision("outer-circular-mixed-combo-13927"),
    "process"
  );
});
