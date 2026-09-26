import test from "node:test";
import assert from "node:assert/strict";

import { cleanJSONSchemaForAntigravity } from "../../open-sse/translator/helpers/geminiHelper.ts";

test("Gemini schema cleanup strips tilde-prefixed Standard Schema metadata", () => {
  const cleaned = cleanJSONSchemaForAntigravity({
    type: "object",
    "~standard": { version: 1 },
    properties: {
      value: { type: "string", "~optional": true, description: "keep me" },
    },
  });

  const json = JSON.stringify(cleaned);
  assert.ok(!json.includes("~standard"));
  assert.ok(!json.includes("~optional"));
  assert.ok(json.includes("keep me"));
});
