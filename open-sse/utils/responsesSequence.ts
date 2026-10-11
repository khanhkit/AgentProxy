/**
 * @file responsesSequence.ts
 * @description Sequence-number helpers for Responses API frames synthesized outside the
 * translator plus a wire-boundary normalizer that reconciles all typed Responses events
 * into one strictly monotonic per-stream sequence.
 */

/**
 * Placeholder used by standalone synthetic frame builders before they reach the Responses
 * wire boundary. It is intentionally NOT the final on-wire authority: independent
 * keepalive/error producers cannot know the translator's live per-stream counter.
 */
export const SYNTHETIC_RESPONSES_SEQUENCE_NUMBER = 1;

/** Wraps a `response.failed` payload's `response` object with the synthetic placeholder. */
export function buildSyntheticResponsesFailedEvent(
  response: Record<string, unknown>
): Record<string, unknown> {
  return {
    type: "response.failed",
    sequence_number: SYNTHETIC_RESPONSES_SEQUENCE_NUMBER,
    response,
  };
}

function isTypedResponsesPayload(
  value: unknown
): value is Record<string, unknown> & { type: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const type = (value as Record<string, unknown>).type;
  return typeof type === "string" && (type === "error" || type.startsWith("response."));
}

function normalizeResponsesDataLine(line: string, nextSequence: () => number): string {
  const newline = line.endsWith("\n") ? "\n" : "";
  let body = newline ? line.slice(0, -1) : line;
  const carriageReturn = body.endsWith("\r") ? "\r" : "";
  if (carriageReturn) body = body.slice(0, -1);

  const match = body.match(/^(\s*data:\s*)(.*)$/);
  if (!match) return line;
  const rawPayload = match[2].trim();
  if (!rawPayload || rawPayload === "[DONE]") return line;

  try {
    const parsed = JSON.parse(rawPayload) as unknown;
    if (!isTypedResponsesPayload(parsed)) return line;
    parsed.sequence_number = nextSequence();
    return `${match[1]}${JSON.stringify(parsed)}${carriageReturn}${newline}`;
  } catch {
    return line;
  }
}

/**
 * Re-number typed Responses SSE events in actual wire order. This runs after synthetic
 * heartbeat/error injection, so independent internal producers may use placeholder sequence
 * values without creating duplicate or decreasing sequence numbers for strict clients.
 *
 * The transform buffers at most one partial SSE line; complete lines are forwarded
 * immediately and non-Responses data/comments are byte-preserved.
 */
export function createResponsesSequenceNormalizerTransform(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let carry = "";
  let sequence = 0;
  const nextSequence = () => (sequence += 1);

  const emitCompleteLines = (
    text: string,
    controller: TransformStreamDefaultController<Uint8Array>
  ): void => {
    carry += text;
    let newlineIndex = carry.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = carry.slice(0, newlineIndex + 1);
      carry = carry.slice(newlineIndex + 1);
      controller.enqueue(encoder.encode(normalizeResponsesDataLine(line, nextSequence)));
      newlineIndex = carry.indexOf("\n");
    }
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      emitCompleteLines(decoder.decode(chunk, { stream: true }), controller);
    },
    flush(controller) {
      emitCompleteLines(decoder.decode(), controller);
      if (carry) {
        controller.enqueue(encoder.encode(normalizeResponsesDataLine(carry, nextSequence)));
        carry = "";
      }
    },
  });
}

/** Preserve status/headers while applying the final Responses sequence authority to SSE. */
export function normalizeResponsesSequenceResponse(response: Response): Response {
  if (!response.body) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) return response;

  return new Response(response.body.pipeThrough(createResponsesSequenceNormalizerTransform()), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
