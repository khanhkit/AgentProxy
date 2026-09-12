import { createHash, randomUUID } from "node:crypto";

const RUST_CORE_SCHEMA_VERSION = 1;
const DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";

type JsonRecord = Record<string, unknown>;

export type RustCodexConnectionConfig = {
  id: string;
  access_token: string;
  workspace_id: string | null;
  base_url: string;
  max_concurrent: number | null;
  credential_version: number;
};

export type RustApiKeyConfig = {
  id: string;
  key_hash: string;
  allowed_connections: string[];
  allowed_endpoints: string[];
  unsupported_policy: boolean;
};

export type RustCoreSnapshot = {
  schema_version: number;
  source_id: string;
  generation: number;
  codex_connections: RustCodexConnectionConfig[];
  api_keys: RustApiKeyConfig[];
  codex_catalog_models: string[];
  codex_native_models: string[];
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveIntegerOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizedStringSet(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function hasPositiveNumber(value: unknown): boolean {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function hashClientApiKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function credentialVersion(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsedDate = Date.parse(value);
    if (Number.isFinite(parsedDate) && parsedDate > 0) return parsedDate;
    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber) && parsedNumber > 0) return Math.trunc(parsedNumber);
  }
  return 1;
}

function isRateLimited(row: JsonRecord, nowMs: number): boolean {
  const raw = nonEmptyString(row.rateLimitedUntil);
  if (!raw) return false;
  const until = Date.parse(raw);
  return Number.isFinite(until) && until > nowMs;
}

export function buildRustApiKeyConfigs(
  rows: unknown[],
  envApiKey: string | null = null,
  nowMs = Date.now()
): RustApiKeyConfig[] {
  const configs: RustApiKeyConfig[] = [];

  for (const value of rows) {
    const row = asRecord(value);
    if (row.isActive === false || row.isBanned === true) continue;
    if (nonEmptyString(row.revokedAt ?? row.revoked_at)) continue;

    const expiresAt = nonEmptyString(row.expiresAt ?? row.expires_at);
    if (expiresAt) {
      const expiresMs = Date.parse(expiresAt);
      if (Number.isFinite(expiresMs) && expiresMs <= nowMs) continue;
    }

    const id = nonEmptyString(row.id);
    if (!id) continue;
    const existingHash = nonEmptyString(row.keyHash ?? row.key_hash);
    const rawKey = nonEmptyString(row.key);
    const keyHash = existingHash || (rawKey ? hashClientApiKey(rawKey) : null);
    if (!keyHash) continue;

    const allowedConnections = stringArray(row.allowedConnections ?? row.allowed_connections);
    const allowedEndpoints = stringArray(row.allowedEndpoints ?? row.allowed_endpoints);
    const allowedModels = stringArray(row.allowedModels ?? row.allowed_models);
    const blockedModels = stringArray(row.blockedModels ?? row.blocked_models);
    const allowedQuotas = stringArray(row.allowedQuotas ?? row.allowed_quotas);
    const scopes = stringArray(row.scopes);
    const ipAllowlist = stringArray(row.ipAllowlist ?? row.ip_allowlist);
    const rateLimits = Array.isArray(row.rateLimits ?? row.rate_limits)
      ? ((row.rateLimits ?? row.rate_limits) as unknown[])
      : [];
    const accessSchedule = row.accessSchedule ?? row.access_schedule;
    const modelAccessMode = nonEmptyString(row.modelAccessMode ?? row.model_access_mode) || "all";

    const unsupportedPolicy =
      modelAccessMode !== "all" ||
      allowedModels.length > 0 ||
      blockedModels.length > 0 ||
      row.disableNonPublicModels === true ||
      row.disable_non_public_models === true ||
      allowedQuotas.length > 0 ||
      scopes.includes("lease:exclusive") ||
      Boolean(accessSchedule && typeof accessSchedule === "object") ||
      rateLimits.length > 0 ||
      hasPositiveNumber(row.maxRequestsPerDay ?? row.max_requests_per_day) ||
      hasPositiveNumber(row.maxRequestsPerMinute ?? row.max_requests_per_minute) ||
      hasPositiveNumber(row.throttleDelayMs ?? row.throttle_delay_ms) ||
      hasPositiveNumber(row.maxSessions ?? row.max_sessions) ||
      ipAllowlist.length > 0 ||
      Boolean(nonEmptyString(row.proxyId ?? row.proxy_id)) ||
      row.usageLimitEnabled === true ||
      row.usage_limit_enabled === true ||
      hasPositiveNumber(row.dailyUsageLimitUsd ?? row.daily_usage_limit_usd) ||
      hasPositiveNumber(row.weeklyUsageLimitUsd ?? row.weekly_usage_limit_usd);

    configs.push({
      id,
      key_hash: keyHash,
      allowed_connections: allowedConnections,
      allowed_endpoints: allowedEndpoints,
      unsupported_policy: unsupportedPolicy,
    });
  }

  const normalizedEnvKey = nonEmptyString(envApiKey);
  if (normalizedEnvKey) {
    configs.unshift({
      id: "env-key",
      key_hash: hashClientApiKey(normalizedEnvKey),
      allowed_connections: [],
      allowed_endpoints: [],
      unsupported_policy: false,
    });
  }

  return configs;
}

export function buildCodexConnectionConfigs(
  rows: unknown[],
  nowMs = Date.now()
): RustCodexConnectionConfig[] {
  const configs: RustCodexConnectionConfig[] = [];

  for (const value of rows) {
    const row = asRecord(value);
    if (row.provider !== "codex" || row.isActive !== true || isRateLimited(row, nowMs)) continue;

    const id = nonEmptyString(row.id);
    const accessToken = nonEmptyString(row.accessToken);
    if (!id || !accessToken) continue;

    const providerSpecificData = asRecord(row.providerSpecificData);
    const workspaceId = nonEmptyString(providerSpecificData.workspaceId);
    const configuredBaseUrl = nonEmptyString(providerSpecificData.rustCoreBaseUrl);

    configs.push({
      id,
      access_token: accessToken,
      workspace_id: workspaceId,
      base_url: configuredBaseUrl || DEFAULT_CODEX_BASE_URL,
      max_concurrent: positiveIntegerOrNull(row.maxConcurrent),
      credential_version: credentialVersion(row.updatedAt),
    });
  }

  return configs;
}

function snapshotSignature(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createRustCoreSnapshotVersioner(sourceId = randomUUID()): {
  next(
    rows: unknown[],
    nowMs?: number,
    apiKeyRows?: unknown[],
    envApiKey?: string | null,
    codexCatalogModels?: string[],
    codexNativeModels?: string[]
  ): RustCoreSnapshot;
} {
  let generation = 0;
  let lastSignature: string | null = null;

  return {
    next(
      rows: unknown[],
      nowMs = Date.now(),
      apiKeyRows: unknown[] = [],
      envApiKey: string | null = null,
      codexCatalogModels: string[] = [],
      codexNativeModels: string[] = []
    ): RustCoreSnapshot {
      const codexConnections = buildCodexConnectionConfigs(rows, nowMs);
      const apiKeys = buildRustApiKeyConfigs(apiKeyRows, envApiKey, nowMs);
      const normalizedCatalogModels = normalizedStringSet(codexCatalogModels);
      const normalizedNativeModels = normalizedStringSet(codexNativeModels);
      const signature = snapshotSignature({
        codexConnections,
        apiKeys,
        codexCatalogModels: normalizedCatalogModels,
        codexNativeModels: normalizedNativeModels,
      });
      if (signature !== lastSignature) {
        generation += 1;
        lastSignature = signature;
      }

      return {
        schema_version: RUST_CORE_SCHEMA_VERSION,
        source_id: sourceId,
        generation,
        codex_connections: codexConnections,
        api_keys: apiKeys,
        codex_catalog_models: normalizedCatalogModels,
        codex_native_models: normalizedNativeModels,
      };
    },
  };
}
