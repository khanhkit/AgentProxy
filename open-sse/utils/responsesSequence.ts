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

const SEQUENCE_KEY = "sequence_number";
const DATA_PREFIX = "data:";
const OUTPUT_FLUSH_CHARS = 16 * 1024;

type LineMode = "leading" | "data-prefix" | "data-space" | "passthrough" | "json" | "after-json";
type SequenceSkipMode = "before" | "primitive" | "string" | "nested" | "done" | null;

/**
 * Re-number JSON `data:` frames in actual wire order without materializing a complete SSE
 * line. The /v1/responses wire boundary only carries Responses JSON objects, comments and
 * `[DONE]`; assigning a sequence to every JSON object here means synthetic keepalives/errors
 * and translated provider events share one final authority.
 *
 * The scanner keeps only parser state plus the current output batch. It rewrites an existing
 * top-level `sequence_number` value wherever that field appears, or injects the field just
 * before the top-level closing brace when absent. Nested fields and string contents are never
 * rewritten. Large `response.completed` payloads therefore continue flowing before their SSE
 * line is complete instead of being buffered/JSON.parse/JSON.stringify'd as one object.
 */
function createUncheckedResponsesSequenceNormalizerTransform(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let sequence = 0;

  let lineMode: LineMode = "leading";
  let dataPrefixIndex = 0;

  let assignedSequence = 0;
  let jsonDepth = 0;
  let jsonInString = false;
  let jsonEscape = false;
  let expectingTopLevelKey = false;
  let parsingTopLevelKey = false;
  let topLevelKeyMatchIndex = 0;
  let topLevelKeyMismatch = false;
  let awaitingTopLevelColon = false;
  let currentTopLevelKeyIsSequence = false;
  let sawTopLevelProperty = false;
  let sawSequence = false;

  let sequenceSkipMode: SequenceSkipMode = null;
  let sequenceSkipDepth = 0;
  let sequenceSkipInString = false;
  let sequenceSkipEscape = false;

  const resetJsonState = (): void => {
    assignedSequence = 0;
    jsonDepth = 0;
    jsonInString = false;
    jsonEscape = false;
    expectingTopLevelKey = false;
    parsingTopLevelKey = false;
    topLevelKeyMatchIndex = 0;
    topLevelKeyMismatch = false;
    awaitingTopLevelColon = false;
    currentTopLevelKeyIsSequence = false;
    sawTopLevelProperty = false;
    sawSequence = false;
    sequenceSkipMode = null;
    sequenceSkipDepth = 0;
    sequenceSkipInString = false;
    sequenceSkipEscape = false;
  };

  const resetLine = (): void => {
    lineMode = "leading";
    dataPrefixIndex = 0;
    resetJsonState();
  };

  const startJson = (): void => {
    lineMode = "json";
    assignedSequence = ++sequence;
    jsonDepth = 1;
    expectingTopLevelKey = true;
  };

  const processText = (
    text: string,
    controller: TransformStreamDefaultController<Uint8Array>
  ): void => {
    let pending = "";
    const emit = (value: string): void => {
      pending += value;
      if (pending.length >= OUTPUT_FLUSH_CHARS) {
        controller.enqueue(encoder.encode(pending));
        pending = "";
      }
    };
    const flushPending = (): void => {
      if (!pending) return;
      controller.enqueue(encoder.encode(pending));
      pending = "";
    };

    const finishJsonObject = (): void => {
      if (!sawSequence) {
        emit(`${sawTopLevelProperty ? "," : ""}\"${SEQUENCE_KEY}\":${assignedSequence}`);
      }
      emit("}");
      lineMode = "after-json";
      resetJsonState();
    };

    const finishSkippedSequenceAtDelimiter = (delimiter: "," | "}"): void => {
      sequenceSkipMode = null;
      sequenceSkipDepth = 0;
      sequenceSkipInString = false;
      sequenceSkipEscape = false;
      currentTopLevelKeyIsSequence = false;
      if (delimiter === ",") {
        emit(",");
        expectingTopLevelKey = true;
        return;
      }
      finishJsonObject();
    };

    const processSkippedSequenceValue = (ch: string): boolean => {
      if (sequenceSkipMode === null) return false;

      if (sequenceSkipMode === "before") {
        if (/\s/.test(ch)) return true;
        if (ch === "," || ch === "}") {
          finishSkippedSequenceAtDelimiter(ch);
          return true;
        }
        if (ch === '"') {
          sequenceSkipMode = "string";
          sequenceSkipInString = true;
          return true;
        }
        if (ch === "{" || ch === "[") {
          sequenceSkipMode = "nested";
          sequenceSkipDepth = 1;
          return true;
        }
        sequenceSkipMode = "primitive";
        return true;
      }

      if (sequenceSkipMode === "string") {
        if (sequenceSkipEscape) {
          sequenceSkipEscape = false;
          return true;
        }
        if (ch === "\\") {
          sequenceSkipEscape = true;
          return true;
        }
        if (ch === '"') {
          sequenceSkipInString = false;
          sequenceSkipMode = "done";
        }
        return true;
      }

      if (sequenceSkipMode === "nested") {
        if (sequenceSkipInString) {
          if (sequenceSkipEscape) {
            sequenceSkipEscape = false;
            return true;
          }
          if (ch === "\\") {
            sequenceSkipEscape = true;
            return true;
          }
          if (ch === '"') sequenceSkipInString = false;
          return true;
        }
        if (ch === '"') {
          sequenceSkipInString = true;
          return true;
        }
        if (ch === "{" || ch === "[") {
          sequenceSkipDepth += 1;
          return true;
        }
        if (ch === "}" || ch === "]") {
          sequenceSkipDepth -= 1;
          if (sequenceSkipDepth === 0) sequenceSkipMode = "done";
          return true;
        }
        return true;
      }

      if (sequenceSkipMode === "primitive") {
        if (ch === "," || ch === "}") {
          finishSkippedSequenceAtDelimiter(ch);
          return true;
        }
        if (/\s/.test(ch)) {
          sequenceSkipMode = "done";
          emit(ch);
        }
        return true;
      }

      // Completed string/nested/primitive value: preserve inter-value whitespace, then resume
      // at the top-level delimiter. Any other byte is malformed JSON and is conservatively
      // suppressed as part of the replaced value until a delimiter arrives.
      if (/\s/.test(ch)) {
        emit(ch);
        return true;
      }
      if (ch === "," || ch === "}") {
        finishSkippedSequenceAtDelimiter(ch);
        return true;
      }
      return true;
    };

    const processJsonChar = (ch: string): void => {
      // A raw newline cannot occur inside valid single-line SSE JSON. Preserve it and reset
      // rather than carrying parser state into the next SSE field on malformed input.
      if (ch === "\n") {
        emit(ch);
        resetLine();
        return;
      }

      if (processSkippedSequenceValue(ch)) return;

      if (jsonInString) {
        emit(ch);
        if (jsonEscape) {
          jsonEscape = false;
          if (parsingTopLevelKey) topLevelKeyMismatch = true;
          return;
        }
        if (ch === "\\") {
          jsonEscape = true;
          if (parsingTopLevelKey) topLevelKeyMismatch = true;
          return;
        }
        if (ch === '"') {
          jsonInString = false;
          if (parsingTopLevelKey) {
            currentTopLevelKeyIsSequence =
              !topLevelKeyMismatch && topLevelKeyMatchIndex === SEQUENCE_KEY.length;
            parsingTopLevelKey = false;
            awaitingTopLevelColon = true;
          }
          return;
        }
        if (parsingTopLevelKey && !topLevelKeyMismatch) {
          if (
            topLevelKeyMatchIndex >= SEQUENCE_KEY.length ||
            ch !== SEQUENCE_KEY[topLevelKeyMatchIndex]
          ) {
            topLevelKeyMismatch = true;
          } else {
            topLevelKeyMatchIndex += 1;
          }
        }
        return;
      }

      if (awaitingTopLevelColon) {
        emit(ch);
        if (/\s/.test(ch)) return;
        awaitingTopLevelColon = false;
        expectingTopLevelKey = false;
        if (ch === ":" && currentTopLevelKeyIsSequence) {
          emit(String(assignedSequence));
          sawSequence = true;
          sequenceSkipMode = "before";
        }
        currentTopLevelKeyIsSequence = false;
        return;
      }

      if (jsonDepth === 1 && expectingTopLevelKey) {
        if (/\s/.test(ch)) {
          emit(ch);
          return;
        }
        if (ch === '"') {
          emit(ch);
          sawTopLevelProperty = true;
          jsonInString = true;
          parsingTopLevelKey = true;
          topLevelKeyMatchIndex = 0;
          topLevelKeyMismatch = false;
          return;
        }
        if (ch === "}") {
          finishJsonObject();
          return;
        }
        // Malformed object: preserve bytes and fall back to generic scanning.
        expectingTopLevelKey = false;
      }

      if (ch === '"') {
        emit(ch);
        jsonInString = true;
        return;
      }
      if (ch === "{" || ch === "[") {
        emit(ch);
        jsonDepth += 1;
        return;
      }
      if (ch === "}" || ch === "]") {
        if (ch === "}" && jsonDepth === 1) {
          finishJsonObject();
          return;
        }
        emit(ch);
        jsonDepth = Math.max(1, jsonDepth - 1);
        return;
      }
      if (ch === "," && jsonDepth === 1) {
        emit(ch);
        expectingTopLevelKey = true;
        return;
      }
      emit(ch);
    };

    for (const ch of text) {
      if (lineMode === "json") {
        processJsonChar(ch);
        continue;
      }

      emit(ch);
      if (ch === "\n") {
        resetLine();
        continue;
      }

      if (lineMode === "passthrough" || lineMode === "after-json") continue;

      if (lineMode === "leading") {
        if (ch === " " || ch === "\t") continue;
        if (ch === DATA_PREFIX[0]) {
          lineMode = "data-prefix";
          dataPrefixIndex = 1;
        } else {
          lineMode = "passthrough";
        }
        continue;
      }

      if (lineMode === "data-prefix") {
        if (ch !== DATA_PREFIX[dataPrefixIndex]) {
          lineMode = "passthrough";
          continue;
        }
        dataPrefixIndex += 1;
        if (dataPrefixIndex === DATA_PREFIX.length) lineMode = "data-space";
        continue;
      }

      if (lineMode === "data-space") {
        if (ch === " " || ch === "\t") continue;
        if (ch === "{") {
          startJson();
        } else {
          lineMode = "passthrough";
        }
      }
    }

    flushPending();
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      processText(decoder.decode(chunk, { stream: true }), controller);
    },
    flush(controller) {
      processText(decoder.decode(), controller);
    },
  });
}

function isCompleteResponsesDataLine(line: string): boolean {
  const match = /^\s*data:[ \t]*(\{.*\})\r?\n?$/s.exec(line);
  if (!match) return false;
  try {
    const payload = JSON.parse(match[1]) as { type?: unknown };
    return typeof payload?.type === "string" && payload.type.startsWith("response.");
  } catch {
    return false;
  }
}

/**
 * Validate each complete SSE line before rewriting it. Malformed or truncated JSON is passed
 * through byte-identical; only valid Responses event objects reach the sequence scanner.
 */
export function createResponsesSequenceNormalizerTransform(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  const inner = createUncheckedResponsesSequenceNormalizerTransform();
  const writer = inner.writable.getWriter();
  const reader = inner.readable.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let gateBuffer = "";

  const writeNormalizedLine = async (
    line: string,
    controller: TransformStreamDefaultController<Uint8Array>
  ): Promise<void> => {
    const appendedNewline = !line.endsWith("\n");
    const writePromise = writer.write(encoder.encode(appendedNewline ? `${line}\n` : line));
    const buffered: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error("Responses sequence normalizer ended before the SSE line");
      if (appendedNewline) buffered.push(value);
      else controller.enqueue(value);
      if (value[value.length - 1] === 0x0a) break;
    }
    await writePromise;

    if (appendedNewline) {
      const last = buffered.pop();
      if (!last) return;
      for (const value of buffered) controller.enqueue(value);
      if (last.length > 1) controller.enqueue(last.subarray(0, -1));
    }
  };

  const processCompleteLines = async (
    controller: TransformStreamDefaultController<Uint8Array>
  ): Promise<void> => {
    let newline = gateBuffer.indexOf("\n");
    while (newline !== -1) {
      const line = gateBuffer.slice(0, newline + 1);
      gateBuffer = gateBuffer.slice(newline + 1);
      if (isCompleteResponsesDataLine(line)) await writeNormalizedLine(line, controller);
      else controller.enqueue(encoder.encode(line));
      newline = gateBuffer.indexOf("\n");
    }
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      gateBuffer += decoder.decode(chunk, { stream: true });
      await processCompleteLines(controller);
    },
    async flush(controller) {
      gateBuffer += decoder.decode();
      if (gateBuffer) {
        if (isCompleteResponsesDataLine(gateBuffer)) {
          await writeNormalizedLine(gateBuffer, controller);
        } else {
          controller.enqueue(encoder.encode(gateBuffer));
        }
      }
      await writer.close();
      const { done } = await reader.read();
      if (!done) throw new Error("Responses sequence normalizer emitted unexpected trailing data");
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
