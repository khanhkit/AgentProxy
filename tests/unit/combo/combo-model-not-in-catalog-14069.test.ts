import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMBO_SKIP_REASONS,
  getComboTrace,
  recordComboDecision,
  resetComboTraceStore,
  startComboTrace,
} from "../../../open-sse/services/combo/decisionTrace.ts";
import { modelAvailabilitySkipReason } from "../../../open-sse/services/combo/types.ts";

test("#14069: model availability distinguishes live-catalog misses", () => {
  assert.equal(modelAvailabilitySkipReason(true), null);
  assert.equal(modelAvailabilitySkipReason(false), "availability");
  assert.equal(modelAvailabilitySkipReason("model_not_in_catalog"), "model_not_in_catalog");
  assert.ok((COMBO_SKIP_REASONS as readonly string[]).includes("model_not_in_catalog"));
});

test("#14069: decision trace accepts model_not_in_catalog as a first-class skip reason", () => {
  resetComboTraceStore();
  startComboTrace("catalog-miss", { strategy: "priority", comboName: "test" });
  recordComboDecision("catalog-miss", {
    step: "step-1",
    target: "openai/not-real",
    decision: "skipped_before_dispatch",
    reason: "model_not_in_catalog",
  });
  assert.equal(getComboTrace("catalog-miss")?.decisions[0]?.reason, "model_not_in_catalog");
});

test("#14069: availability gate and chat resolver wire the catalog-miss sentinel", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const gate = fs.readFileSync(path.join(root, "open-sse/services/combo/executeTargetGates.ts"), "utf8");
  const chat = fs.readFileSync(path.join(root, "src/sse/handlers/chat.ts"), "utf8");
  assert.match(gate, /const skipReason = modelAvailabilitySkipReason\(available\)/);
  assert.match(gate, /reason: skipReason/);
  assert.match(chat, /modelInfo\?\.errorType === "model_not_found"\) return "model_not_in_catalog"/);
});
