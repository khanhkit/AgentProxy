import type { ExecuteInput, ExecutorExecuteResult } from "./base.ts";
import {
  createMuseSparkStreamFinishNormalizer,
  isResponsesTerminalLine,
  normalizeMuseSparkFinishReason,
} from "./opencodeMuseSpark.ts";

export function normalizeMuseSparkResponse(
  input: ExecuteInput,
  result: ExecutorExecuteResult
): ExecutorExecuteResult {
  const model = String(input.model ?? "");
  if (!model.startsWith("muse-spark")) return result;
  if (!("response" in result) || !result.response?.ok || !result.response.body) return result;
  const bodyObj =
    input.body && typeof input.body === "object" && !Array.isArray(input.body)
      ? (input.body as Record<string, unknown>)
      : null;
  const rawBudget = bodyObj?.max_tokens;
  const budget = typeof rawBudget === "number" && Number.isFinite(rawBudget) ? rawBudget : null;
  const response = result.response;
  const isSse = response.headers.get("content-type")?.includes("event-stream") ?? false;

  if (!isSse) {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const text = await response.clone().text();
          let out = text;
          try {
            const parsed = JSON.parse(text) as Record<string, unknown>;
            normalizeMuseSparkFinishReason(parsed, budget);
            out = JSON.stringify(parsed);
          } catch {
            // Non-JSON body: forward verbatim.
          }
          controller.enqueue(new TextEncoder().encode(out));
        } catch (error) {
          controller.error(error);
          return;
        }
        controller.close();
      },
    });
    return {
      ...result,
      response: new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    };
  }

  const normalizer = createMuseSparkStreamFinishNormalizer(budget);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const reader = response.body.getReader();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (!closed) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            if (buffer.length > 0 && !closed) controller.enqueue(encoder.encode(normalizer(buffer)));
            if (!closed) {
              closed = true;
              controller.close();
            }
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            controller.enqueue(encoder.encode(normalizer(line) + "\n"));
            if (isResponsesTerminalLine(line)) {
              closed = true;
              void reader.cancel().catch(() => undefined);
              controller.close();
              return;
            }
          }
        }
      } catch (error) {
        if (!closed) {
          closed = true;
          controller.error(error);
        }
      }
    },
    cancel(reason) {
      closed = true;
      reader.cancel(reason).catch(() => undefined);
    },
  });
  return {
    ...result,
    response: new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
  };
}
