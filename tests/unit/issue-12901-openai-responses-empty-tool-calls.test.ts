import test from "node:test";
import assert from "node:assert/strict";
import { openaiToOpenAIResponsesResponse } from "../../open-sse/translator/response/openai-responses.ts";
import { initState } from "../../open-sse/translator/index.ts";
import { FORMATS } from "../../open-sse/translator/formats.ts";

function collect(chunks: unknown[]) {
  const state = initState(FORMATS.OPENAI_RESPONSES);
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  for (const chunk of chunks) {
    const result = openaiToOpenAIResponsesResponse(chunk, state);
    if (result) events.push(...result);
  }
  return events;
}

test("#12901: empty tool_calls arrays do not close the active message", () => {
  const events = collect([
    { id: "chatcmpl-kimi", model: "Kimi-K2.6", choices: [{ index: 0, delta: { content: "Hel", tool_calls: [] }, finish_reason: null }] },
    { id: "chatcmpl-kimi", model: "Kimi-K2.6", choices: [{ index: 0, delta: { content: "lo", tool_calls: [] }, finish_reason: null }] },
    { id: "chatcmpl-kimi", model: "Kimi-K2.6", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } },
  ]);
  const deltas = events.filter((e) => e.event === "response.output_text.delta").map((e) => e.data.delta);
  assert.deepEqual(deltas, ["Hel", "lo"]);
  const done = events.filter((e) => e.event === "response.output_text.done");
  assert.equal(done.length, 1);
  assert.equal(done[0].data.text, "Hello");
});

test("#12901: non-empty tool_calls still close the message and emit the call", () => {
  const events = collect([
    { id: "chatcmpl-kimi2", model: "Kimi-K2.6", choices: [{ index: 0, delta: { content: "searching", tool_calls: [] }, finish_reason: null }] },
    { id: "chatcmpl-kimi2", model: "Kimi-K2.6", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "lookup", arguments: '{"q":"x"}' } }] }, finish_reason: null }] },
    { id: "chatcmpl-kimi2", model: "Kimi-K2.6", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } },
  ]);
  const completed = events.find((e) => e.event === "response.completed");
  assert.ok(completed);
  const response = completed.data.response as { output: Array<{ type?: string }> };
  assert.equal(response.output.filter((item) => item.type === "message").length, 1);
  assert.equal(response.output.filter((item) => item.type === "function_call").length, 1);
});
