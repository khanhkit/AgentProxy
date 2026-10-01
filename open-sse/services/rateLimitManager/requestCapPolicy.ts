import {
  requestCapSettings,
  type RequestCap,
  type RequestCapSettings,
} from "./requestCap.ts";

export function hasRpmOverride(
  overrides: Map<string, Record<string, number>>,
  connectionId: string
): boolean {
  const rpm = overrides.get(connectionId)?.rpm;
  return typeof rpm === "number" && rpm > 0;
}

export function capSettingsWithinBudget(args: {
  provider: string;
  connectionId: string;
  cap: RequestCap;
  source: "body-stated" | "learned" | "persisted";
  globalMinTimeMs: number;
  connectionMinTimeMs?: number;
  queueBudgetMs: number;
  warn: (message: string) => void;
}): RequestCapSettings | null {
  const {
    provider,
    connectionId,
    cap,
    source,
    globalMinTimeMs,
    connectionMinTimeMs,
    queueBudgetMs,
    warn,
  } = args;
  const settings = requestCapSettings(cap);
  settings.minTime = Math.max(globalMinTimeMs, connectionMinTimeMs ?? 0, settings.minTime);
  if (settings.minTime <= queueBudgetMs) return settings;
  warn(
    `[RATE-LIMIT] ${provider}:${connectionId.slice(0, 8)} — ignoring ${source} cap of ${cap.requests} request(s) per ${Math.ceil(cap.windowMs / 1000)}s: ${settings.minTime}ms between requests exceeds the ${queueBudgetMs}ms queue budget (raise the request queue maxWaitMs to honour it)`
  );
  return null;
}
