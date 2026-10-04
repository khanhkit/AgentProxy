import {
  isValidRequestCap,
  parseRequestCapFromBody,
  type RequestCap,
  type RequestCapSettings,
} from "./requestCap.ts";
import { capSettingsWithinBudget, hasRpmOverride } from "./requestCapPolicy.ts";

export interface LearnedCapPolicyContext {
  provider: string;
  connectionId: string;
  source: "body-stated" | "learned" | "persisted";
  globalMinTimeMs: number;
  connectionMinTimeMs?: number;
  queueBudgetMs: number;
  overrides: Map<string, Record<string, number>>;
  warn: (message: string) => void;
}

export interface PersistedCapFields {
  capRequests: number;
  capWindowMs: number;
  hasCap: boolean;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function decodePersistedCap(
  data: Record<string, unknown>,
  key: string,
  warn: (message: string) => void
): PersistedCapFields {
  const capRequests = numberOrZero(data.capRequests);
  const capWindowMs = numberOrZero(data.capWindowMs);
  const hasCap = isValidRequestCap({ requests: capRequests, windowMs: capWindowMs });
  if (!hasCap && (data.capRequests !== undefined || data.capWindowMs !== undefined)) {
    warn(
      `[RATE-LIMIT] ${key} — dropping persisted cap with invalid shape (${String(data.capRequests)} per ${String(data.capWindowMs)}ms)`
    );
  }
  return { capRequests, capWindowMs, hasCap };
}

export function resolveLearnedCapSettings(
  cap: RequestCap,
  context: LearnedCapPolicyContext
): RequestCapSettings | null {
  return capSettingsWithinBudget({
    provider: context.provider,
    connectionId: context.connectionId,
    cap,
    source: context.source,
    globalMinTimeMs: context.globalMinTimeMs,
    connectionMinTimeMs: context.connectionMinTimeMs,
    queueBudgetMs: context.queueBudgetMs,
    warn: context.warn,
  });
}

export function connectionHasRpmOverride(
  overrides: Map<string, Record<string, number>>,
  connectionId: string
): boolean {
  return hasRpmOverride(overrides, connectionId);
}

export function parseBodyRequestCap(responseBody: unknown): RequestCap | null {
  return parseRequestCapFromBody(responseBody);
}

export interface PersistedLimitLike {
  provider: string;
  connectionId: string;
  lastUpdated: number;
  limit?: number;
  remaining?: number;
  minTime?: number;
  capRequests?: number;
  capWindowMs?: number;
}

export function restorePersistedLearnedLimits(args: {
  parsed: Record<string, unknown>;
  nowMs: number;
  warn: (message: string) => void;
  setLearned: (key: string, entry: PersistedLimitLike) => void;
  isEnabled: (connectionId: string) => boolean;
  getLimiter: (key: string) => unknown | undefined;
  hasRpmOverride: (connectionId: string) => boolean;
  resolveCapSettings: (
    provider: string,
    connectionId: string,
    cap: RequestCap,
    source: "persisted"
  ) => RequestCapSettings | null;
  updateLimiter: (limiter: unknown, settings: Partial<RequestCapSettings>) => void;
}): number {
  let count = 0;
  for (const [key, dataRaw] of Object.entries(args.parsed)) {
    const data = dataRaw && typeof dataRaw === "object" && !Array.isArray(dataRaw)
      ? (dataRaw as Record<string, unknown>)
      : {};
    const lastUpdated = numberOrZero(data.lastUpdated);
    if (lastUpdated > 0 && args.nowMs - lastUpdated > 24 * 60 * 60 * 1000) continue;
    const connectionId = typeof data.connectionId === "string" ? data.connectionId : "";
    const provider = typeof data.provider === "string" ? data.provider : "";
    const limit = numberOrZero(data.limit);
    const remaining = numberOrZero(data.remaining);
    const minTime = numberOrZero(data.minTime);
    const { capRequests, capWindowMs, hasCap } = decodePersistedCap(data, key, args.warn);
    args.setLearned(key, {
      provider,
      connectionId,
      lastUpdated,
      ...(limit > 0 ? { limit } : {}),
      ...(remaining >= 0 ? { remaining } : {}),
      ...(minTime >= 0 ? { minTime } : {}),
      ...(hasCap ? { capRequests, capWindowMs } : {}),
    });
    if (!connectionId || !args.isEnabled(connectionId)) continue;
    const limiter = args.getLimiter(key);
    if (limiter && hasCap && !args.hasRpmOverride(connectionId)) {
      const settings = args.resolveCapSettings(
        provider,
        connectionId,
        { requests: capRequests, windowMs: capWindowMs },
        "persisted"
      );
      if (settings) {
        args.updateLimiter(limiter, settings);
        count++;
      }
    } else if (limiter && limit > 0) {
      args.updateLimiter(limiter, { minTime: minTime || Math.max(0, Math.floor(60_000 / limit) - 10) });
      count++;
    }
  }
  return count;
}

export interface BodyCapPlan {
  cap: RequestCap;
  settings: RequestCapSettings;
  learned: {
    limit: number;
    minTime: number;
    capRequests: number;
    capWindowMs: number;
  };
  logMessage: string;
}

export function planBodyCap(args: {
  provider: string;
  connectionId: string;
  responseBody: unknown;
  resolveSettings: (cap: RequestCap) => RequestCapSettings | null;
}): BodyCapPlan | null {
  const cap = parseBodyRequestCap(args.responseBody);
  if (!cap) return null;
  const settings = args.resolveSettings(cap);
  if (!settings) return null;
  return {
    cap,
    settings,
    learned: {
      limit: Math.max(1, Math.round((cap.requests * 60_000) / cap.windowMs)),
      minTime: settings.minTime,
      capRequests: cap.requests,
      capWindowMs: cap.windowMs,
    },
    logMessage: `[RATE-LIMIT] ${args.provider}:${args.connectionId.slice(0, 8)} — body-stated cap: ${cap.requests} request(s) per ${Math.ceil(cap.windowMs / 1000)}s, pacing at ${settings.minTime}ms`,
  };
}

export async function loadPersistedLearnedLimits(args: {
  getRaw: () => Promise<unknown>;
  restore: (parsed: Record<string, unknown>) => number;
  log: (message: string) => void;
  error: (message: string, error: unknown) => void;
}): Promise<void> {
  try {
    const raw = await args.getRaw();
    if (typeof raw !== "string" || raw.trim().length === 0) return;
    const value = JSON.parse(raw) as unknown;
    const parsed = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
    const count = args.restore(parsed);
    if (count > 0) args.log(`📥 [RATE-LIMIT] Restored ${count} learned rate limit(s) from persistence`);
  } catch (error) {
    args.error("[RATE-LIMIT] Failed to load persisted limits:", error);
  }
}

export function stripConnectionCaps<T extends { connectionId: string; capRequests?: number; capWindowMs?: number }>(
  entries: Iterable<[string, T]>,
  connectionId: string,
  setEntry: (key: string, entry: T) => void
): boolean {
  let stripped = false;
  for (const [key, entry] of entries) {
    if (entry.connectionId !== connectionId || !entry.capRequests) continue;
    const { capRequests: _cap, capWindowMs: _window, ...rest } = entry;
    setEntry(key, rest as T);
    stripped = true;
  }
  return stripped;
}
