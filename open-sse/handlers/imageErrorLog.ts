import { redactSensitiveErrorText } from "../utils/error.ts";

export function stringifyImageErrorForLog(value: unknown): string {
  return redactSensitiveErrorText(renderImageErrorForLog(value));
}

function renderImageErrorForLog(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${readErrorPart(value, "name", "Error")}: ${readErrorPart(value, "message", "[unserializable message]")}`;
  if (value !== null && typeof value === "object") {
    try {
      const serialized = JSON.stringify(value);
      if (typeof serialized === "string") return serialized;
    } catch {}
  }
  try {
    return String(value);
  } catch {
    return "[unserializable error]";
  }
}

function readErrorPart(error: Error, key: "name" | "message", fallback: string): string {
  try {
    const part: unknown = error[key];
    return typeof part === "string" ? part : fallback;
  } catch {
    return fallback;
  }
}
