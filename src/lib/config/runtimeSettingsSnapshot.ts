import type { OperatorProviderErrorRule } from "@agentproxy/open-sse/config/providerErrorRules.ts";

export type JsonRecord = Record<string, unknown>;

export type RuntimeReloadSection =
  | "payloadRules"
  | "modelAliases"
  | "backgroundDegradation"
  | "cliCompatProviders"
  | "cacheControl"
  | "usageTracking"
  | "healthCheckLogs"
  | "thoughtSignature"
  | "modelsDevSync"
  | "corsOrigins"
  | "ccBridgeTransforms"
  | "systemTransforms"
  | "systemPrompt"
  | "authzBypass"
  | "bannedSignals"
  | "providerErrorRules"
  | "thinkingBudget"
  | "taskRouting";

export interface RuntimeReloadChange {
  section: RuntimeReloadSection;
  source: string;
}

export interface AuthzBypassSnapshot {
  enabled: boolean;
  prefixes: string[];
}

export interface RuntimeSettingsSnapshot {
  payloadRules: unknown;
  modelAliases: Record<string, string>;
  backgroundDegradation: JsonRecord | null;
  cliCompatProviders: string[];
  alwaysPreserveClientCache: string;
  antigravitySignatureCacheMode: string;
  usageTokenBuffer: unknown;
  hideHealthCheckLogs: boolean;
  modelsDevSyncEnabled: boolean;
  modelsDevSyncInterval: number | null;
  corsOrigins: string;
  ccBridgeTransforms: unknown;
  systemTransforms: unknown;
  systemPrompt: unknown;
  authzBypass: AuthzBypassSnapshot;
  customBannedSignals: string[];
  providerErrorRules: Record<string, OperatorProviderErrorRule[]> | null;
  thinkingBudget: JsonRecord | null;
  taskRouting: JsonRecord | null;
}

export const DEFAULT_AUTHZ_BYPASS_SNAPSHOT: AuthzBypassSnapshot = {
  enabled: true,
  prefixes: ["/api/mcp/"],
};

export const DEFAULT_RUNTIME_SETTINGS_SNAPSHOT: RuntimeSettingsSnapshot = {
  payloadRules: null,
  modelAliases: {},
  backgroundDegradation: null,
  cliCompatProviders: [],
  alwaysPreserveClientCache: "auto",
  antigravitySignatureCacheMode: "enabled",
  usageTokenBuffer: null,
  hideHealthCheckLogs: false,
  modelsDevSyncEnabled: false,
  modelsDevSyncInterval: null,
  corsOrigins: "",
  ccBridgeTransforms: null,
  systemTransforms: null,
  systemPrompt: null,
  authzBypass: DEFAULT_AUTHZ_BYPASS_SNAPSHOT,
  customBannedSignals: [],
  providerErrorRules: null,
  thinkingBudget: null,
  taskRouting: null,
};

export function isTruthyEnvFlag(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  return new Set(["1", "true", "yes", "on"]).has(value.trim().toLowerCase());
}

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as JsonRecord)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalize((value as JsonRecord)[key])])
    );
  }
  return value;
}

function parseStoredJson(value: unknown, field: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn(
      `[HOT_RELOAD] Failed to parse persisted settings field "${field}":`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    )
  );
}

function normalizeOperatorProviderErrorRules(
  value: unknown
): Record<string, OperatorProviderErrorRule[]> | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const result: Record<string, OperatorProviderErrorRule[]> = {};
  for (const [provider, list] of Object.entries(record)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const rules = list.filter(
      (entry): entry is OperatorProviderErrorRule =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as OperatorProviderErrorRule).status === "number" &&
        typeof (entry as OperatorProviderErrorRule).match === "string" &&
        typeof (entry as OperatorProviderErrorRule).scope === "string"
    );
    if (rules.length > 0) result[provider.toLowerCase()] = rules;
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function normalizeStringRecord(value: unknown): Record<string, string> {
  const record = toRecord(parseStoredJson(value, "modelAliases"));
  const entries = Object.entries(record)
    .map(([key, entryValue]) => [
      key.trim(),
      typeof entryValue === "string" ? entryValue.trim() : "",
    ])
    .filter(([key, entryValue]) => key.length > 0 && entryValue.length > 0);
  return Object.fromEntries(entries);
}

function normalizeBackgroundDegradation(value: unknown): JsonRecord | null {
  const record = toRecord(parseStoredJson(value, "backgroundDegradation"));
  if (Object.keys(record).length === 0) return null;
  const degradationMap = Object.fromEntries(
    Object.entries(toRecord(record.degradationMap))
      .map(([key, entryValue]) => [
        key.trim(),
        typeof entryValue === "string" ? entryValue.trim() : "",
      ])
      .filter(([key, entryValue]) => key.length > 0 && entryValue.length > 0)
  );
  return {
    enabled: record.enabled === true,
    degradationMap,
    detectionPatterns: normalizeStringArray(record.detectionPatterns),
  };
}

function normalizeOptionalRecord(value: unknown, field: string): JsonRecord | null {
  const record = toRecord(parseStoredJson(value, field));
  return Object.keys(record).length > 0 ? record : null;
}

function normalizeTaskRouting(value: unknown): JsonRecord | null {
  const record = normalizeOptionalRecord(value, "taskRouting");
  if (!record) return null;
  const { stats: _ignoredStats, ...persisted } = record;
  return persisted;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeAuthzBypass(settings: Readonly<Record<string, unknown>>): AuthzBypassSnapshot {
  const enabled =
    settings.localOnlyManageScopeBypassEnabled === false
      ? false
      : settings.localOnlyManageScopeBypassEnabled === true
        ? true
        : DEFAULT_AUTHZ_BYPASS_SNAPSHOT.enabled;
  const rawPrefixes = settings.localOnlyManageScopeBypassPrefixes;
  const prefixes = Array.isArray(rawPrefixes)
    ? Array.from(
        new Set(
          rawPrefixes
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length > 0 && entry.startsWith("/"))
        )
      )
    : [...DEFAULT_AUTHZ_BYPASS_SNAPSHOT.prefixes];
  return { enabled, prefixes };
}

export function buildRuntimeSettingsSnapshot(
  settings: Readonly<Record<string, unknown>>
): RuntimeSettingsSnapshot {
  return {
    payloadRules: parseStoredJson(settings.payloadRules, "payloadRules"),
    modelAliases: normalizeStringRecord(settings.modelAliases),
    backgroundDegradation: normalizeBackgroundDegradation(settings.backgroundDegradation),
    cliCompatProviders: normalizeStringArray(settings.cliCompatProviders),
    alwaysPreserveClientCache:
      typeof settings.alwaysPreserveClientCache === "string"
        ? settings.alwaysPreserveClientCache
        : DEFAULT_RUNTIME_SETTINGS_SNAPSHOT.alwaysPreserveClientCache,
    antigravitySignatureCacheMode:
      typeof settings.antigravitySignatureCacheMode === "string"
        ? settings.antigravitySignatureCacheMode
        : DEFAULT_RUNTIME_SETTINGS_SNAPSHOT.antigravitySignatureCacheMode,
    usageTokenBuffer: settings.usageTokenBuffer ?? null,
    hideHealthCheckLogs: settings.hideHealthCheckLogs === true,
    modelsDevSyncEnabled: settings.modelsDevSyncEnabled === true,
    modelsDevSyncInterval: normalizeNumber(settings.modelsDevSyncInterval),
    corsOrigins: typeof settings.corsOrigins === "string" ? settings.corsOrigins : "",
    ccBridgeTransforms: parseStoredJson(settings.ccBridgeTransforms, "ccBridgeTransforms"),
    systemTransforms: parseStoredJson(settings.systemTransforms, "systemTransforms"),
    systemPrompt: settings.systemPrompt
      ? parseStoredJson(settings.systemPrompt, "systemPrompt")
      : null,
    authzBypass: normalizeAuthzBypass(settings),
    customBannedSignals: normalizeStringArray(settings.customBannedSignals),
    providerErrorRules: normalizeOperatorProviderErrorRules(settings.providerErrorRules),
    thinkingBudget: normalizeOptionalRecord(settings.thinkingBudget, "thinkingBudget"),
    taskRouting: normalizeTaskRouting(settings.taskRouting),
  };
}
