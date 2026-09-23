import test from "node:test";
import assert from "node:assert/strict";

const { openaiToGeminiRequest } =
  await import("../../open-sse/translator/request/openai-to-gemini.ts");

// Regression for #3842: thinking.budget_tokens on the explicit Claude-format path
// must be capped by the model's thinkingBudgetCap, matching the reasoning_effort path.
test("OpenAI -> Gemini thinking.budget_tokens is capped by model thinkingBudgetCap (#3842)", () => {
  // gemini-2.5-flash has thinkingBudgetCap: 24576
  const result = openaiToGeminiRequest(
    "gemini-2.5-flash",
    {
      messages: [{ role: "user", content: "think hard" }],
      thinking: { type: "enabled", budget_tokens: 50000 },
    },
    false
  ) as any;
  assert.equal(result.generationConfig.thinkingConfig.thinkingBudget, 24576);
  assert.equal(result.generationConfig.thinkingConfig.includeThoughts, true);
});

test("OpenAI -> Gemini thinking.budget_tokens=0 disables thinking after cap", () => {
  const result = openaiToGeminiRequest(
    "gemini-2.5-flash",
    {
      messages: [{ role: "user", content: "no thinking" }],
      thinking: { type: "enabled", budget_tokens: 0 },
    },
    false
  ) as any;
  assert.equal(result.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.equal(result.generationConfig.thinkingConfig.includeThoughts, false);
});

test("OpenAI -> Gemini thinking.budget_tokens below cap passes through", () => {
  const result = openaiToGeminiRequest(
    "gemini-2.5-flash",
    {
      messages: [{ role: "user", content: "some thinking" }],
      thinking: { type: "enabled", budget_tokens: 8192 },
    },
    false
  ) as any;
  assert.equal(result.generationConfig.thinkingConfig.thinkingBudget, 8192);
  assert.equal(result.generationConfig.thinkingConfig.includeThoughts, true);
});

// Guard: models with thinkingBudgetCap=0 (e.g. gemini-3-flash) must NOT
// receive thinkingConfig even when the caller explicitly sends budget_tokens.
test("OpenAI -> Gemini skips thinkingConfig for model with thinkingBudgetCap=0", () => {
  const result = openaiToGeminiRequest(
    "gemini-3-flash",
    {
      messages: [{ role: "user", content: "hello" }],
      thinking: { type: "enabled", budget_tokens: 5000 },
    },
    false
  ) as any;
  assert.equal(
    result.generationConfig.thinkingConfig,
    undefined,
    "gemini-3-flash (thinkingBudgetCap:0) must not receive thinkingConfig"
  );
});

// Guard: models with thinkingBudgetCap=0 (e.g. gemini-3-flash) still receive
// thinkingConfig on the reasoning_effort path, clamped to budget 0 / includeThoughts
// false — matching the pre-#6943 native-defaults contract (see
// translator-openai-to-gemini-defaults.test.ts). Omitting thinkingConfig entirely
// here would crash callers that read `.thinkingConfig.thinkingBudget` unconditionally.
test("OpenAI -> Gemini clamps reasoning_effort thinkingConfig to 0 for model with thinkingBudgetCap=0", () => {
  const result = openaiToGeminiRequest(
    "gemini-3-flash",
    {
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "high",
    },
    false
  ) as any;
  assert.equal(result.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.equal(result.generationConfig.thinkingConfig.includeThoughts, false);
});

// Guard: models not in MODEL_SPECS (thinkingBudgetCap=undefined) default to allowed.
test("OpenAI -> Gemini allows thinkingConfig for unknown model (no spec)", () => {
  const result = openaiToGeminiRequest(
    "some-unknown-gemini-model",
    {
      messages: [{ role: "user", content: "hello" }],
      thinking: { type: "enabled", budget_tokens: 5000 },
    },
    false
  ) as any;
  assert.equal(result.generationConfig.thinkingConfig.thinkingBudget, 5000);
  assert.equal(result.generationConfig.thinkingConfig.includeThoughts, true);
});
