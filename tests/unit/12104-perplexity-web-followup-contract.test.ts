import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuery } from "../../open-sse/executors/perplexity-web/protocol.ts";

test("buildQuery preserves system contract on follow-up requests", () => {
  const parsed = {
    systemMsg: "You are an expert coder. <tool>contract</tool>",
    history: [
      { role: "user", content: "How do I reverse a string in JS?" },
      { role: "assistant", content: "Use .reverse()" },
    ],
    currentMsg: "What about Python?",
  };

  const output = buildQuery(parsed, "abc-123");

  assert.match(output, /<tool>contract<\/tool>/);
  assert.match(output, /What about Python\?/);
});
