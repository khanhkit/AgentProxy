import test from "node:test";
import assert from "node:assert/strict";

import { applyClaudeEffortVariant } from "../../open-sse/handlers/chatCore/claudeEffortVariant.ts";
import {
  shouldExposeClaudeEffortVariants,
} from "../../open-sse/utils/claudeEffortVariants.ts";
import { isSkippedEffortProvider } from "../../open-sse/utils/syncedEffortVariants.ts";
import { FORMATS } from "../../open-sse/translator/formats.ts";

test("Devin agentic keeps tier-embedded Claude model id literal", () => {
  const body: Record<string, unknown> = {
    model: "claude-opus-5-low",
    messages: [],
  };
  const result = applyClaudeEffortVariant({
    provider: "devin-cli-agentic",
    effectiveModel: "claude-opus-5-low",
    body,
    sourceFormat: FORMATS.OPENAI,
  });
  assert.equal(result.effectiveModel, "claude-opus-5-low");
  assert.equal(body.model, "claude-opus-5-low");
  assert.equal(body.reasoning_effort, undefined);
  assert.equal(result.log, null);
});

test("Devin alias keeps tier-embedded Claude model id literal", () => {
  const body: Record<string, unknown> = {
    model: "claude-opus-5-high",
    messages: [],
  };
  const result = applyClaudeEffortVariant({
    provider: "dva",
    effectiveModel: "claude-opus-5-high",
    body,
    sourceFormat: FORMATS.OPENAI,
  });
  assert.equal(result.effectiveModel, "claude-opus-5-high");
  assert.equal(body.reasoning_effort, undefined);
});

test("Claude catalog effort synthesis skips Devin qualified ids", () => {
  assert.equal(
    shouldExposeClaudeEffortVariants({
      id: "dva/claude-sonnet-5",
      name: "Claude Sonnet 5",
      owned_by: "devin-cli-agentic",
    }),
    false
  );
});

test("synced effort synthesis recognizes Devin providers as literal-id lanes", () => {
  for (const provider of ["devin-cli", "devin-cli-agentic", "devin-desktop", "dv", "dva"]) {
    assert.equal(isSkippedEffortProvider(provider), true, provider);
  }
});
