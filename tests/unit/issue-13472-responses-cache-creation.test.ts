import { test } from "node:test";
import assert from "node:assert/strict";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.ts";
import {
  getPromptCacheCreationTokens,
  getPromptCacheReadTokens,
} from "../../src/lib/usage/tokenAccounting.ts";

function translateUsage(promptTokensDetails: Record<string, number>) {
  const state: Record<string, unknown> = {};
  openaiToOpenAIResponsesResponse(
    {
      id: "chatcmpl-cache",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 5000,
        completion_tokens: 20,
        total_tokens: 5020,
        prompt_tokens_details: promptTokensDetails,
      },
    },
    state
  );
  return state.usage as Record<string, unknown>;
}

test("#13472: cache creation tokens survive chat-completions -> responses usage", () => {
  const usage = translateUsage({ cached_tokens: 0, cache_creation_tokens: 4800 });
  assert.equal(getPromptCacheCreationTokens(usage), 4800);
});

test("#13472: cache read tokens still survive the responses usage hop", () => {
  const usage = translateUsage({ cached_tokens: 4800, cache_creation_tokens: 0 });
  assert.equal(getPromptCacheReadTokens(usage), 4800);
});

test("#13472: cache read and creation tokens are preserved together", () => {
  const usage = translateUsage({ cached_tokens: 1200, cache_creation_tokens: 800 });
  assert.equal(getPromptCacheReadTokens(usage), 1200);
  assert.equal(getPromptCacheCreationTokens(usage), 800);
});
