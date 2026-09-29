import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeGeminiToolName } from "../../open-sse/translator/helpers/geminiToolsSanitizer.ts";

test("Gemini tool names never start with a digit", () => {
  assert.equal(sanitizeGeminiToolName("1c_probe"), "t1c_probe");
  assert.equal(sanitizeGeminiToolName("_1c_probe"), "t1c_probe");
  assert.match(sanitizeGeminiToolName(`1c_${"x".repeat(80)}`), /^[A-Za-z_]/);
});

test("letter-first tool names are not prefixed", () => {
  assert.equal(sanitizeGeminiToolName("c1_probe"), "c1_probe");
});
