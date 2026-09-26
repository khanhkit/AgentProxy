import test from "node:test";
import assert from "node:assert/strict";

import { CREDENTIAL_PATTERNS } from "../../open-sse/utils/credentialPatterns.ts";
import { sanitizeErrorMessage } from "../../open-sse/utils/errorSanitization.ts";
import { redactCredentials } from "../../src/lib/guardrails/credentialMasker.ts";

const shapes = [
  { key: "gsk_" + "A".repeat(52), type: "groq", label: "[REDACTED:groq]" },
  { key: "xai-" + "B".repeat(80), type: "xai", label: "[REDACTED:xai]" },
  { key: "sk-" + "c".repeat(32), type: "openai_compatible", label: "[REDACTED:openai_compatible]" },
] as const;

for (const shape of shapes) {
  test(`AP-ISS-0124 redacts ${shape.type} keys in guardrail and public error sanitizer`, () => {
    const input = `upstream rejected API key ${shape.key}`;

    const guardrail = redactCredentials(input);
    assert.equal(guardrail.modified, true);
    assert.equal(guardrail.text.includes(shape.key), false);
    assert.ok(guardrail.text.includes(shape.label));
    assert.deepEqual(guardrail.detections.map((d) => d.type), [shape.type]);

    const error = sanitizeErrorMessage(input);
    assert.equal(error.includes(shape.key), false);
    assert.match(error, /\[REDACTED\]/);
  });
}

test("AP-ISS-0124 specific sk- credential labels still win before the generic fallback", () => {
  const openAi = "sk-" + "D".repeat(48);
  const anthropic = "sk-ant-api3-" + "E".repeat(40);

  const openAiResult = redactCredentials(openAi);
  assert.deepEqual(openAiResult.detections.map((d) => d.type), ["openai"]);
  assert.equal(openAiResult.text, "[REDACTED:openai]");

  const anthropicResult = redactCredentials(anthropic);
  assert.deepEqual(anthropicResult.detections.map((d) => d.type), ["anthropic"]);
  assert.equal(anthropicResult.text, "[REDACTED:anthropic]");
});

test("AP-ISS-0124 generic OpenAI-compatible fallback remains the last catalog entry", () => {
  assert.equal(CREDENTIAL_PATTERNS.at(-1)?.name, "openai_compatible");
});

test("AP-ISS-0124 short lookalikes remain untouched", () => {
  for (const input of ["gsk_short", "xai-short", "sk-short"]) {
    const result = redactCredentials(input);
    assert.equal(result.modified, false);
    assert.equal(result.text, input);
  }
});
