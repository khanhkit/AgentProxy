import { logRetryHintUnreadable, readProseRetryAfter } from "../../utils/error.ts";

export async function readRetryAfterFromResponse(
  response: Response,
  log: { warn: (...args: unknown[]) => void; debug?: (...args: unknown[]) => void },
  tag: string,
  model: string
): Promise<{ text: string; json: Record<string, unknown> | null; proseRetryAfter: string | null }> {
  let text = "";
  let json: Record<string, unknown> | null = null;
  try {
    const cloned = response.clone();
    try {
      text = await cloned.text();
      if (text) {
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          logRetryHintUnreadable(log, tag, model, response.status, "unparseable body");
        }
      }
    } catch {
      logRetryHintUnreadable(log, tag, model, response.status, "unparseable body");
    }
  } catch {
    logRetryHintUnreadable(log, tag, model, response.status, "clone failed");
  }
  return { text, json, proseRetryAfter: readProseRetryAfter(text) };
}
