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

test("AP-ISS-0194: sequence normalization starts forwarding a large event before its line completes", async () => {
  const transform = createResponsesSequenceNormalizerTransform();
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();
  const largePrefix =
    'data: {"type":"response.completed","sequence_number":99,"response":{"output":"' +
    "x".repeat(64 * 1024);

  const writePromise = writer.write(encoder.encode(largePrefix));
  const firstRead = await Promise.race([
    reader.read(),
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100)),
  ]);

  if (firstRead === "timeout") {
    await reader.cancel();
    await writer.abort();
    await writePromise.catch(() => undefined);
    assert.fail("normalizer buffered the entire SSE line instead of forwarding a bounded prefix");
  }

  assert.equal(firstRead.done, false);
  const firstText = decoder.decode(firstRead.value, { stream: true });
  assert.match(firstText, /"sequence_number":1/);
  assert.ok(firstText.includes("x".repeat(1024)), "large payload bytes should already be flowing");
  await writePromise;

  const finishWrite = writer.write(encoder.encode('"}}\n\n'));
  const remaining: string[] = [firstText];
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    remaining.push(decoder.decode(next.value, { stream: true }));
    if (remaining.join("").endsWith("\n\n")) break;
  }
  await finishWrite;
  await writer.close();
  await reader.cancel();

  const output = remaining.join("");
  assert.ok(output.endsWith('"}}\n\n'));
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
