import test from "node:test";
import assert from "node:assert/strict";

import {
  createResponsesSequenceNormalizerTransform,
  normalizeResponsesSequenceResponse,
} from "../../open-sse/utils/responsesSequence.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return text;
    text += decoder.decode(value, { stream: true });
  }
}

function sequences(text: string): number[] {
  return Array.from(text.matchAll(/"sequence_number":(\d+)/g), (match) => Number(match[1]));
}

test("AP-ISS-0194: Responses sequence normalizer reconciles synthetic and real events across chunk splits", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          ': keepalive\n\ndata: {"type":"response.in_progress","sequence_number":1,"response":{"status":"in_progress"}}\n\nevent: response.created\nda'
        )
      );
      controller.enqueue(
        encoder.encode(
          'ta: {"type":"response.created","sequence_number":1,"response":{"id":"resp_1"}}\n\ndata: {"type":"response.output_text.delta","sequence_number":9,"delta":"hi"}\n\ndata: [DONE]\n\n'
        )
      );
      controller.close();
    },
  });

  const output = await readText(stream.pipeThrough(createResponsesSequenceNormalizerTransform()));

  assert.deepEqual(sequences(output), [1, 2, 3]);
  assert.match(output, /^: keepalive\n\n/);
  assert.match(output, /event: response\.created\n/);
  assert.match(output, /data: \[DONE\]\n\n$/);
});

test("AP-ISS-0194: non-SSE responses are returned unchanged", () => {
  const response = new Response('{"ok":true}', {
    status: 400,
    headers: { "content-type": "application/json" },
  });
  assert.equal(normalizeResponsesSequenceResponse(response), response);
});
