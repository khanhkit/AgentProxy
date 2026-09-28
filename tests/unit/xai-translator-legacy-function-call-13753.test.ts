import test from "node:test";
import assert from "node:assert/strict";

import {
  chatRequestToXaiResponses,
  xaiCompletedToChatJson,
} from "../../src/lib/providers/xai/translators/openai-chat.ts";
import { xaiCompletedToGeminiJson } from "../../src/lib/providers/xai/translators/gemini.ts";

test("xAI chat translator preserves legacy assistant function_call", () => {
  const out = chatRequestToXaiResponses({
    model: "grok-4.1-fast",
    messages: [
      {
        role: "assistant",
        function_call: { name: "lookup", arguments: "{\"q\":\"x\"}" },
      },
    ],
  } as never);

  const call = out.input.find((entry) => entry.type === "function_call");
  assert.equal(call?.name, "lookup");
  assert.equal(call?.arguments, "{\"q\":\"x\"}");
});

test("xAI reverse translators derive total tokens from prompt/completion aliases", () => {
  const completed = {
    usage: { prompt_tokens: 7, completion_tokens: 5 },
    output: [],
  };

  const chat = xaiCompletedToChatJson(completed as never) as {
    usage: { total_tokens: number };
  };
  const gemini = xaiCompletedToGeminiJson(completed as never) as {
    usageMetadata: { totalTokenCount: number };
  };

  assert.equal(chat.usage.total_tokens, 12);
  assert.equal(gemini.usageMetadata.totalTokenCount, 12);
});
