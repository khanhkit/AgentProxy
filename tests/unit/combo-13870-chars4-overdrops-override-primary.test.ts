import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Historical #13870 regression fixture: chars/4 can overstate a repetitive agent-session
// body by several-fold. AP-ISS-0195 later tightened the safety ordering after audit finding
// 4233318126: a target that actually fails the context check must not outrank a target whose
// known catalog limit fits, even when the rejected target has a near-boundary manual override.
// The rejected override remains available as an advisory fallback; it is not dropped.

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-13870-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const { saveModelsDevCapabilities, clearModelsDevCapabilities } =
  await import("../../src/lib/modelsDevSync.ts");
const { filterTargetsByRequestCompatibility } = await import("../../open-sse/services/combo.ts");
const { estimateTokens } = await import("../../open-sse/services/contextManager.ts");
const { setModelContextOverride, removeModelContextOverride } =
  await import("../../src/lib/db/modelContextOverrides.ts");

test.after(() => {
  core.resetDbInstance();
  if (ORIGINAL_DATA_DIR === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  }
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test.beforeEach(() => {
  clearModelsDevCapabilities();
});

const noopLog = { info() {}, warn() {}, error() {}, debug() {} };

function target(modelStr: string) {
  return {
    kind: "model" as const,
    stepId: modelStr,
    executionKey: modelStr,
    modelStr,
    provider: modelStr.split("/")[0],
    providerId: null,
    connectionId: null,
    weight: 1,
    label: null,
  };
}

function capabilityEntry(limitContext: number | null) {
  return {
    tool_call: true,
    reasoning: false,
    attachment: false,
    structured_output: true,
    temperature: true,
    modalities_input: JSON.stringify(["text"]),
    modalities_output: JSON.stringify(["text"]),
    knowledge_cutoff: null,
    release_date: null,
    last_updated: null,
    status: null,
    family: null,
    open_weights: false,
    limit_context: limitContext,
    limit_input: limitContext,
    limit_output: 65_536,
    interleaved_field: null,
  };
}

function repetitiveAgentBody() {
  const toolResultChunk =
    '{"tool_call_id":"call_abc123","role":"tool","content":"' +
    "line of repeated structured tool output ".repeat(160) +
    '"}';
  const messages = [];
  for (let i = 0; i < 400; i++) {
    messages.push({ role: i % 2 === 0 ? "assistant" : "tool", content: toolResultChunk });
  }
  const tools = Array.from({ length: 25 }, (_, i) => ({
    type: "function",
    function: { name: `tool_${i}`, description: "d".repeat(200), parameters: { type: "object" } },
  }));
  return { messages, tools, max_tokens: 32000 };
}

test("#13870/AP-ISS-0195: known-fitting catalog target leads while rejected overrides remain fallback", () => {
  saveModelsDevCapabilities({
    "unit-13870-primary": { model: capabilityEntry(null) },
    "unit-13870-fallback": { model: capabilityEntry(null) },
    "unit-13870-emergency": { model: capabilityEntry(899_153) },
    "unit-13870-small": { model: capabilityEntry(128_450) },
  });

  setModelContextOverride("unit-13870-primary", "model", 250_000);
  setModelContextOverride("unit-13870-fallback", "model", 250_000);

  try {
    const body = repetitiveAgentBody();

    const estimated = estimateTokens({ messages: body.messages, tools: body.tools });
    assert.ok(
      estimated > 250_000 - 32_000,
      `expected the chars/4 estimate to exceed the override window; got ${estimated}`
    );

    const targets = [
      target("unit-13870-primary/model"),
      target("unit-13870-fallback/model"),
      target("unit-13870-emergency/model"),
      target("unit-13870-small/model"),
    ];

    const out = filterTargetsByRequestCompatibility(targets, body, noopLog);

    assert.deepEqual(
      out.map((entry) => entry.modelStr),
      [
        "unit-13870-emergency/model",
        "unit-13870-primary/model",
        "unit-13870-fallback/model",
        "unit-13870-small/model",
      ],
      "known-fitting catalog targets must lead context-rejected overrides, while rejected overrides remain available as fallbacks"
    );
  } finally {
    removeModelContextOverride("unit-13870-primary", "model");
    removeModelContextOverride("unit-13870-fallback", "model");
  }
});
