import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-stream-utils-tail-"));

const { createSSEStream } = await import("../../open-sse/utils/stream.ts");
const { FORMATS } = await import("../../open-sse/translator/formats.ts");
const textEncoder = new TextEncoder();

async function readTransformed(chunks: string[], options: Parameters<typeof createSSEStream>[0]) {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(textEncoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(source.pipeThrough(createSSEStream(options))).text();
}

test("createSSEStream passthrough does not swallow false positive textual tool call", async () => {
  let onCompletePayload = null;
  const sentence = "Checking: [Tool call: terminal] was executed successfully.";

  const text = await readTransformed(
    [
      `data: ${JSON.stringify({
        id: "chatcmpl_false_positive_textual_tool",
        object: "chat.completion.chunk",
        created: 1,
        model: "MainAgent",
        choices: [{ index: 0, delta: { role: "assistant", content: sentence } }],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: "chatcmpl_false_positive_textual_tool",
        object: "chat.completion.chunk",
        created: 1,
        model: "MainAgent",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      })}\n\n`,
    ],
    {
      mode: "passthrough",
      sourceFormat: FORMATS.OPENAI,
      provider: "agentproxy",
      model: "MainAgent",
      body: { messages: [{ role: "user", content: "inspect status" }] },
      onComplete(payload) {
        onCompletePayload = payload;
      },
    }
  );

  const choice = onCompletePayload.responseBody.choices[0];
  assert.equal(choice.finish_reason, "stop");
  assert.equal(choice.message.content, sentence);
  assert.equal(choice.message.tool_calls, undefined);
  assert.match(text, /\[Tool call: terminal\] was executed successfully/);
});

test("createSSEStream passthrough does not swallow false positive textual tool call starting chunk", async () => {
  let onCompletePayload = null;
  const chunk1 = "[Tool call: terminal]";
  const chunk2 = " was skipped.";

  const text = await readTransformed(
    [
      `data: ${JSON.stringify({
        id: "chatcmpl_false_positive_textual_tool_start",
        object: "chat.completion.chunk",
        created: 1,
        model: "MainAgent",
        choices: [{ index: 0, delta: { role: "assistant", content: chunk1 } }],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: "chatcmpl_false_positive_textual_tool_start",
        object: "chat.completion.chunk",
        created: 1,
        model: "MainAgent",
        choices: [{ index: 0, delta: { content: chunk2 } }],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: "chatcmpl_false_positive_textual_tool_start",
        object: "chat.completion.chunk",
        created: 1,
        model: "MainAgent",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      })}\n\n`,
    ],
    {
      mode: "passthrough",
      sourceFormat: FORMATS.OPENAI,
      provider: "agentproxy",
      model: "MainAgent",
      body: { messages: [{ role: "user", content: "inspect status" }] },
      onComplete(payload) {
        onCompletePayload = payload;
      },
    }
  );

  const choice = onCompletePayload.responseBody.choices[0];
  assert.equal(choice.finish_reason, "stop");
  assert.equal(choice.message.content, chunk1 + chunk2);
  assert.equal(choice.message.tool_calls, undefined);
  assert.match(text, /\[Tool call: terminal\] was skipped/);
});
