import test from "node:test";
import assert from "node:assert/strict";

import { createStructuredSSECollector } from "../../open-sse/utils/streamPayloadCollector.ts";

const SUMMARY_TEXT_BUDGET = 64 * 1024;

type BuiltStreamPayload = {
  _summaryTruncated?: boolean;
  _truncated?: boolean;
};

type OpenAISummary = {
  choices: Array<{
    message: {
      content: string | null;
      reasoning_content?: string;
      tool_calls?: Array<{ function: { arguments: string } }>;
    };
  }>;
};

type ResponsesSummary = { output: Array<{ content: Array<{ text: string }> }> };
type ClaudeSummary = { content: Array<{ thinking?: string; input?: unknown }> };
type GeminiSummary = { candidates: Array<{ content: { parts: Array<{ text?: string }> } }> };

function openAiChunk(delta: Record<string, unknown>) {
  return {
    id: "chatcmpl-0066",
    object: "chat.completion.chunk",
    model: "test-model",
    choices: [{ index: 0, delta, finish_reason: null }],
  };
}

test("AP-ISS-0066 leaves normal-size summaries unmarked and byte-for-byte intact", () => {
  const collector = createStructuredSSECollector({ format: "openai" });
  collector.push(openAiChunk({ content: "hello", reasoning_content: "think" }));
  const summary = collector.getSummary() as OpenAISummary;
  const built = collector.build(summary, { includeEvents: false }) as BuiltStreamPayload;

  assert.equal(summary.choices[0].message.content, "hello");
  assert.equal(summary.choices[0].message.reasoning_content, "think");
  assert.equal(built._summaryTruncated, undefined);
  assert.equal(built._truncated, undefined);
});

test("AP-ISS-0066 bounds OpenAI reasoning summary independently of raw event caps", () => {
  const collector = createStructuredSSECollector({
    format: "openai",
    maxEvents: 4,
    maxBytes: 8 * 1024,
  });
  const delta = "r".repeat(1024);
  for (let i = 0; i < 512; i += 1) collector.push(openAiChunk({ reasoning_content: delta }));

  const summary = collector.getSummary() as OpenAISummary;
  const reasoning = summary.choices[0].message.reasoning_content;
  assert.equal(typeof reasoning, "string");
  assert.ok(
    reasoning.length <= SUMMARY_TEXT_BUDGET,
    `reasoning summary retained ${reasoning.length} bytes`
  );
  assert.equal(
    reasoning,
    "r".repeat(reasoning.length),
    "bounded summary must preserve streamed bytes"
  );
  const built = collector.build(summary, { includeEvents: false }) as BuiltStreamPayload;
  assert.equal(
    built._summaryTruncated,
    true,
    "summary truncation must be observable to downstream persistence"
  );
  assert.equal(
    built._truncated,
    true,
    "summary truncation must trigger existing fail-closed continuation semantics"
  );
});

test("AP-ISS-0066 bounds repeated OpenAI tool-call arguments", () => {
  const collector = createStructuredSSECollector({
    format: "openai",
    maxEvents: 4,
    maxBytes: 8 * 1024,
  });
  const argDelta = "a".repeat(1024);
  for (let i = 0; i < 512; i += 1) {
    collector.push(
      openAiChunk({
        tool_calls: [
          {
            index: 0,
            id: i === 0 ? "call-0066" : undefined,
            type: "function",
            function: { name: i === 0 ? "stress" : undefined, arguments: argDelta },
          },
        ],
      })
    );
  }

  const summary = collector.getSummary() as OpenAISummary;
  const args = summary.choices[0].message.tool_calls?.[0]?.function.arguments;
  assert.equal(typeof args, "string");
  assert.ok(args.length <= SUMMARY_TEXT_BUDGET, `tool arguments retained ${args.length} bytes`);
  assert.equal(args, "a".repeat(args.length), "bounded arguments must preserve retained bytes");
});

test("AP-ISS-0066 bounds Responses output-text delta summary", () => {
  const collector = createStructuredSSECollector({
    format: "openai-responses",
    maxEvents: 4,
    maxBytes: 8 * 1024,
  });
  const delta = "o".repeat(1024);
  for (let i = 0; i < 512; i += 1) {
    collector.push({ type: "response.output_text.delta", delta });
  }

  const summary = collector.getSummary() as ResponsesSummary;
  const text = summary.output[0].content[0].text;
  assert.ok(
    text.length <= SUMMARY_TEXT_BUDGET,
    `Responses summary retained ${text.length} bytes`
  );
});

test("AP-ISS-0066 bounds Claude streamed thinking and tool JSON buffers", () => {
  const thinkingCollector = createStructuredSSECollector({
    format: "claude",
    maxEvents: 4,
    maxBytes: 8 * 1024,
  });
  thinkingCollector.push({
    type: "content_block_start",
    index: 0,
    content_block: { type: "thinking", thinking: "" },
  });
  const thinkingDelta = "t".repeat(1024);
  for (let i = 0; i < 512; i += 1) {
    thinkingCollector.push({
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: thinkingDelta },
    });
  }
  const thinkingSummary = thinkingCollector.getSummary() as ClaudeSummary;
  const thinking = thinkingSummary.content[0].thinking;
  assert.equal(typeof thinking, "string");
  assert.ok(thinking.length <= SUMMARY_TEXT_BUDGET);

  const toolCollector = createStructuredSSECollector({
    format: "claude",
    maxEvents: 4,
    maxBytes: 8 * 1024,
  });
  toolCollector.push({
    type: "content_block_start",
    index: 0,
    content_block: { type: "tool_use", id: "toolu-0066", name: "stress", input: {} },
  });
  const jsonDelta = "j".repeat(1024);
  for (let i = 0; i < 512; i += 1) {
    toolCollector.push({
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: jsonDelta },
    });
  }
  const toolSummary = toolCollector.getSummary() as ClaudeSummary;
  const input = toolSummary.content[0].input;
  assert.equal(
    typeof input,
    "string",
    "truncated non-JSON tool buffer must remain a bounded string rather than expand memory"
  );
  assert.ok(input.length <= SUMMARY_TEXT_BUDGET, `Claude tool JSON retained ${input.length} bytes`);
});

test("AP-ISS-0066 bounds structured summary item counts", () => {
  const itemBudget = 128;

  const openAi = createStructuredSSECollector({ format: "openai", maxEvents: 4 });
  for (let i = 0; i < 512; i += 1) {
    openAi.push(
      openAiChunk({
        tool_calls: [
          {
            index: i,
            id: `call-${i}`,
            type: "function",
            function: { name: `tool-${i}`, arguments: "{}" },
          },
        ],
      })
    );
  }
  const openAiSummary = openAi.getSummary() as OpenAISummary;
  assert.ok((openAiSummary.choices[0].message.tool_calls?.length ?? 0) <= itemBudget);
  assert.equal((openAi.build(openAiSummary, { includeEvents: false }) as BuiltStreamPayload)._summaryTruncated, true);

  const claude = createStructuredSSECollector({ format: "claude", maxEvents: 4 });
  for (let i = 0; i < 512; i += 1) {
    claude.push({
      type: "content_block_start",
      index: i,
      content_block: { type: "text", text: `block-${i}` },
    });
  }
  const claudeSummary = claude.getSummary() as ClaudeSummary;
  assert.ok(claudeSummary.content.length <= itemBudget);

  const gemini = createStructuredSSECollector({ format: "gemini", maxEvents: 4 });
  for (let i = 0; i < 512; i += 1) {
    gemini.push({
      candidates: [
        { content: { role: "model", parts: [{ functionCall: { name: `tool-${i}`, args: {} } }] } },
      ],
    });
  }
  const geminiSummary = gemini.getSummary() as GeminiSummary;
  assert.ok(geminiSummary.candidates[0].content.parts.length <= itemBudget);
});

test("AP-ISS-0066 bounds Gemini adjacent text/thought summary accumulation", () => {
  const collector = createStructuredSSECollector({
    format: "gemini",
    maxEvents: 4,
    maxBytes: 8 * 1024,
  });
  const delta = "g".repeat(1024);
  for (let i = 0; i < 512; i += 1) {
    collector.push({
      candidates: [{ content: { role: "model", parts: [{ text: delta, thought: true }] } }],
    });
  }

  const summary = collector.getSummary() as GeminiSummary;
  const text = summary.candidates[0].content.parts[0].text;
  assert.equal(typeof text, "string");
  assert.ok(text.length <= SUMMARY_TEXT_BUDGET, `Gemini summary retained ${text.length} bytes`);
});
