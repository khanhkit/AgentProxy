import { test } from "node:test";
import assert from "node:assert/strict";
import { openaiToClaudeRequest } from "../../open-sse/translator/request/openai-to-claude.ts";

test("zed-hosted claude-haiku-4-5 thinking stays under the real output cap", () => {
  const body = {
    model: "claude-haiku-4-5",
    max_tokens: 16000,
    reasoning_effort: "high",
    tools: [
      {
        type: "function",
        function: { name: "read_file", parameters: { type: "object", properties: {} } },
      },
    ],
    messages: [{ role: "user", content: "hello" }],
  };

  const result = openaiToClaudeRequest(
    "claude-haiku-4-5",
    body,
    false,
    { _provider: "zed-hosted" }
  );

  assert.ok((result.max_tokens as number) <= 64000);
});
