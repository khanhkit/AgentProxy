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

test("AP-ISS-0194: a large event is normalized only after its complete line validates", async () => {
  const input =
    'data: {"type":"response.completed","sequence_number":99,"response":{"output":"' +
    "x".repeat(64 * 1024) +
    '"}}\n\n';
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(input.slice(0, 32_000)));
      controller.enqueue(encoder.encode(input.slice(32_000)));
      controller.close();
    },
  });

  const output = await readText(stream.pipeThrough(createResponsesSequenceNormalizerTransform()));
  assert.ok(output.endsWith('"}}\n\n'));
  assert.match(output, /"sequence_number":1/);
  assert.equal(output.includes('"sequence_number":99'), false);
});

test("AP-ISS-0194: sequence normalizer injects a missing top-level sequence without touching nested fields", async () => {
  const input =
    'data: {"type":"response.completed","response":{"sequence_number":777,"status":"completed"}}\r\n\r\n';
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(input.slice(0, 37)));
      controller.enqueue(encoder.encode(input.slice(37)));
      controller.close();
    },
  });

  const output = await readText(stream.pipeThrough(createResponsesSequenceNormalizerTransform()));
  const dataLine = output.split(/\r?\n/).find((line) => line.startsWith("data: "))!;
  const payload = JSON.parse(dataLine.slice("data: ".length));

  assert.equal(payload.sequence_number, 1);
  assert.equal(payload.response.sequence_number, 777, "nested provider data must remain untouched");
});

test("AP-ISS-0194: only the top-level sequence field is replaced when nested data uses the same key", async () => {
  const input =
    'data: {"type":"response.completed","response":{"sequence_number":777},"sequence_number":42}\n\n';
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(input));
      controller.close();
    },
  });

  const output = await readText(stream.pipeThrough(createResponsesSequenceNormalizerTransform()));
  const payload = JSON.parse(output.split("\n")[0].slice("data: ".length));
  assert.equal(payload.sequence_number, 1);
  assert.equal(payload.response.sequence_number, 777);
});

test("AP-ISS-0194 OCR: duplicate and escaped sequence keys retain one final canonical value", async () => {
  const inputs = [
    'data: {"type":"response.completed","sequence_number":7,"sequence_number":8}\r\n\r\n',
    'data: {"type":"response.completed","sequence\\u005fnumber":9}\r\n\r\n',
  ];

  for (const input of inputs) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const split = input.indexOf("sequence") + 5;
        controller.enqueue(encoder.encode(input.slice(0, split)));
        controller.enqueue(encoder.encode(input.slice(split)));
        controller.close();
      },
    });
    const output = await readText(stream.pipeThrough(createResponsesSequenceNormalizerTransform()));
    const payload = JSON.parse(output.split(/\r?\n/)[0].slice("data: ".length));
    assert.equal(payload.sequence_number, 1);
    if (input.includes("\\u005f")) {
      assert.equal(output.includes('"sequence_number"'), false, "do not inject a duplicate key");
    }
  }
});

test("AP-ISS-0194 OCR: malformed multiline Responses data is preserved byte-identical", async () => {
  const input =
    'data: {"type":"response.completed","sequence_number":99,\ndata: "response":{"status":"completed"}}\n\n';
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(input));
      controller.close();
    },
  });

  const output = await readText(stream.pipeThrough(createResponsesSequenceNormalizerTransform()));
  assert.equal(output, input);
});

test("AP-ISS-0194 OCR: large truncated sequence values are preserved byte-identical at EOF", async () => {
  const input =
    'data: {"type":"response.completed","padding":"' +
    "x".repeat(17 * 1024) +
    '","sequence_number":"unterminated';
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(input.slice(0, 16_500)));
      controller.enqueue(encoder.encode(input.slice(16_500)));
      controller.close();
    },
  });

  const output = await readText(stream.pipeThrough(createResponsesSequenceNormalizerTransform()));
  assert.equal(output, input);
});

test("AP-ISS-0194 OCR: generic JSON data frames are not assigned Responses sequence numbers", async () => {
  const input = 'data: {"error":{"message":"upstream"}}\n\n';
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(input));
      controller.close();
    },
  });

  const output = await readText(stream.pipeThrough(createResponsesSequenceNormalizerTransform()));
  assert.equal(output, input);
});

test("AP-ISS-0194 OCR: oversized single-line Responses events fail closed at the wire boundary", async () => {
  const input =
    'data: {"type":"response.completed","sequence_number":99,"response":{"output":"' +
    "x".repeat(16 * 1024 * 1024 + 1024) +
    '"}}\n\n';
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < input.length; offset += 64 * 1024) {
        controller.enqueue(encoder.encode(input.slice(offset, offset + 64 * 1024)));
      }
      controller.close();
    },
  });

  await assert.rejects(
    readText(stream.pipeThrough(createResponsesSequenceNormalizerTransform())),
    /Responses SSE event line exceeds 16777216 bytes/
  );
});

test("AP-ISS-0194 OCR: downstream cancellation propagates through the sequence normalizer", async () => {
  let cancelReason: unknown = null;
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta"'));
    },
    cancel(reason) {
      cancelReason = reason;
    },
  });

  const reader = source.pipeThrough(createResponsesSequenceNormalizerTransform()).getReader();
  const pendingRead = reader.read();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await reader.cancel("client-disconnect");

  assert.deepEqual(await pendingRead, { value: undefined, done: true });
  assert.equal(
    cancelReason,
    "client-disconnect",
    "downstream cancellation reaches upstream source"
  );
});
