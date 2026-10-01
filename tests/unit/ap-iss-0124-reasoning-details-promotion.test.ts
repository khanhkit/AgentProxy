import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-c193-reasoning-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { sanitizeOpenAIResponse, sanitizeStreamingChunk } = await import(
  "../../open-sse/handlers/responseSanitizer.ts"
);
const { synthesizeOpenAiSseFromJson } = await import("../../open-sse/utils/jsonToSse.ts");
const { createSSEStream } = await import("../../open-sse/utils/stream.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");

function parseData(text: string) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .filter((payload) => payload !== "[DONE]")
    .map((payload) => JSON.parse(payload));
}

test("AP-ISS-0124 non-streaming sanitizer promotes reasoning_details even when reasoning exists", () => {
  const sanitized = sanitizeOpenAIResponse({
    model: "openrouter/deepseek/deepseek-v4-flash",
    choices: [
      {
        message: {
          role: "assistant",
          content: "Visible answer",
          reasoning: "native reasoning",
          reasoning_details: [{ type: "reasoning.text", text: "details trace" }],
        },
      },
    ],
  }) as {
    choices: Array<{
      message: {
        reasoning?: unknown;
        reasoning_content?: unknown;
        reasoning_details?: unknown;
      };
    }>;
  };

  const message = sanitized.choices[0].message;
  assert.equal(message.reasoning, "native reasoning");
  assert.equal(message.reasoning_content, "details trace");
  assert.deepEqual(message.reasoning_details, [
    { type: "reasoning.text", text: "details trace" },
  ]);
});

test("AP-ISS-0124 signature-only details stay out of reasoning_content", () => {
  const sanitized = sanitizeOpenAIResponse({
    choices: [
      {
        message: {
          role: "assistant",
          content: "Visible answer",
          reasoning: "native reasoning",
          reasoning_details: [{ type: "reasoning.encrypted", data: "sig" }],
        },
      },
    ],
  }) as { choices: Array<{ message: Record<string, unknown> }> };

  assert.equal(sanitized.choices[0].message.reasoning_content, undefined);
  assert.equal(sanitized.choices[0].message.reasoning, "native reasoning");
});

test("AP-ISS-0124 streaming sanitizer promotes details alongside reasoning", () => {
  const sanitized = sanitizeStreamingChunk({
    choices: [
      {
        delta: {
          reasoning: "native chunk",
          reasoning_details: [{ type: "reasoning.text", text: "details chunk" }],
        },
      },
    ],
  }) as { choices: Array<{ delta: Record<string, unknown> }> };

  assert.equal(sanitized.choices[0].delta.reasoning, "native chunk");
  assert.equal(sanitized.choices[0].delta.reasoning_content, "details chunk");
});

test("AP-ISS-0124 JSON-to-SSE emits both reasoning and promoted reasoning_content", () => {
  const sse = synthesizeOpenAiSseFromJson(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            reasoning: "native reasoning",
            reasoning_details: [{ type: "reasoning.text", text: "details trace" }],
            content: "Visible answer",
          },
        },
      ],
    })
  );
  const deltas = parseData(sse).map((event) => event.choices[0].delta);
  assert.equal(
    deltas.find((delta) => delta.reasoning !== undefined)?.reasoning,
    "native reasoning"
  );
  assert.equal(
    deltas.find((delta) => delta.reasoning_content !== undefined)?.reasoning_content,
    "details trace"
  );
});

test("AP-ISS-0124 passthrough stream serializes newly promoted reasoning_content", async () => {
  const upstream =
    "data: " +
    JSON.stringify({
      id: "chatcmpl_reasoning_details",
      object: "chat.completion.chunk",
      created: 1,
      model: "deepseek-v4-flash",
      choices: [
        {
          index: 0,
          delta: {
            reasoning: "native stream",
            reasoning_details: [{ type: "reasoning.text", text: "details stream" }],
          },
          finish_reason: null,
        },
      ],
    }) +
    "\n\n";

  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(upstream));
      controller.close();
    },
  });

  const text = await new Response(
    source.pipeThrough(
      createSSEStream({
        mode: "passthrough",
        sourceFormat: FORMATS.OPENAI,
        provider: "openrouter",
        model: "deepseek-v4-flash",
        body: { messages: [{ role: "user", content: "hello" }] },
      })
    )
  ).text();

  const payloads = parseData(text);
  const delta = payloads.find((event) => event.choices?.[0]?.delta?.reasoning_content)?.choices?.[0]
    ?.delta;
  assert.ok(delta);
  assert.equal(delta.reasoning, "native stream");
  assert.equal(delta.reasoning_content, "details stream");
});
