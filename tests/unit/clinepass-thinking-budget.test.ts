import test from "node:test";
import assert from "node:assert/strict";

import { DefaultExecutor } from "../../open-sse/executors/default.ts";

// DefaultExecutor.ensureThinkingBudget — fills a missing/non-positive reasoning budget.
// Positive client budgets are explicit choices and must survive unchanged (#14888).
// The helper applies to all providers, not only clinepass (#6912).

test("preserves an undersized positive budget for a clinepass reasoning model", () => {
  const executor = new DefaultExecutor("clinepass");
  const body = {
    model: "cline-pass/deepseek-v4-pro",
    reasoning_effort: "high",
    max_tokens: 512,
  } as Record<string, unknown>;

  executor.ensureThinkingBudget(body, "cline-pass/deepseek-v4-pro");
  assert.equal(body.max_tokens, 512);
});

test("sets max_tokens floor when absent for a reasoning model", () => {
  const executor = new DefaultExecutor("clinepass");
  const body = {
    model: "cline-pass/deepseek-v4-flash",
    reasoning_effort: "medium",
  } as Record<string, unknown>;

  executor.ensureThinkingBudget(body, "cline-pass/deepseek-v4-flash");
  assert.equal(body.max_tokens, 4096);
});

test("leaves an already-sufficient budget untouched", () => {
  const executor = new DefaultExecutor("clinepass");
  const body = {
    model: "cline-pass/deepseek-v4-pro",
    reasoning_effort: "high",
    max_tokens: 8000,
  } as Record<string, unknown>;

  executor.ensureThinkingBudget(body, "cline-pass/deepseek-v4-pro");
  assert.equal(body.max_tokens, 8000);
});

test("no-op when reasoning is disabled", () => {
  const executor = new DefaultExecutor("clinepass");
  const body = {
    model: "cline-pass/deepseek-v4-pro",
    max_tokens: 100,
  } as Record<string, unknown>;

  executor.ensureThinkingBudget(body, "cline-pass/deepseek-v4-pro");
  assert.equal(body.max_tokens, 100);
});

test("preserves a positive GLM-5.2 client budget now that the catalog marks it reasoning-capable", () => {
  const executor = new DefaultExecutor("clinepass");
  const body = {
    model: "cline-pass/glm-5.2",
    reasoning_effort: "high",
    max_tokens: 100,
  } as Record<string, unknown>;

  executor.ensureThinkingBudget(body, "cline-pass/glm-5.2");
  assert.equal(body.max_tokens, 100);
});

test("no-op for an unknown model without reasoning metadata", () => {
  const executor = new DefaultExecutor("clinepass");
  const body = {
    model: "cline-pass/unknown-model",
    reasoning_effort: "high",
    max_tokens: 100,
  } as Record<string, unknown>;

  executor.ensureThinkingBudget(body, "cline-pass/unknown-model");
  assert.equal(body.max_tokens, 100);
});

test("preserves a positive budget for a non-clinepass reasoning provider (#6912/#14888)", () => {
  // The helper still applies to non-clinepass providers, but positive client budgets win.
  // Use nvidia, which has Nemotron Nano with supportsReasoning in the NVIDIA registry.
  const executor = new DefaultExecutor("nvidia");
  const body = {
    model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    reasoning_effort: "high",
    max_tokens: 100,
  } as Record<string, unknown>;

  executor.ensureThinkingBudget(body, "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
  assert.equal(body.max_tokens, 100);
});
