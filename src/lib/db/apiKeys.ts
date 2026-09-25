/**
 * db/apiKeys.js — API key management.
 */

import { createHash } from "crypto";
import {
  ApiKeyVaultError,
  buildApiKeyStorageSentinel,
  decryptApiKeyBearer,
  encryptApiKeyBearer,
  isApiKeyStorageSentinel,
} from "./apiKeyVault";
import { v4 as uuidv4 } from "uuid";
import { getDbInstance, rowToCamel } from "./core";
import { backupDbFile } from "./backup";
import { registerDbStateResetter } from "./stateReset";
import { invalidateReasoningRoutingRuleCache } from "./reasoningRoutingRules";
import { getKeyGroupsForApiKey, checkKeyModelAccess } from "./apiKeyGroups";
import { API_KEY_COLUMN_FALLBACKS } from "./apiKeyColumnFallbacks";
import { parseApiKeyUsageLimitFields } from "./apiKeyUsageLimitFields";
import { setNoLog } from "../compliance/noLog";
import { resolveModelAlias } from "@agentproxy/open-sse/services/modelDeprecation.ts";
import { getProviderAlias, resolveProviderId } from "@/shared/constants/providers";
import { getSyncedAvailableModelsByConnection, getCustomModels, getModelIsHidden } from "./models";
import {
  CLAUDE_CODE_PROVIDER_PREFIXES,
  preferClaudeCodeForUnprefixedClaudeModels,
  stripExtendedContextSuffix,
  isPotentialUnprefixedClaudeCodeModel,
  addModelCandidate,
  addProviderAliasScopedCandidates,
  modelPatternMatches,
  hasClaudeCodeWildcardPermission,
  matchesWildcardPattern,
} from "./apiKeys/modelPermissions";
import { ALL_COMBOS_ACCESS_RULE } from "@/shared/constants/comboAccess";
import {
  parseAllowedModels,
  parseAllowedCombos,
  parseNoLog,
  parseAutoResolve,
  parseDisableNonPublicModels,
  parseAllowUsageCommand,
  parseIsActive,
  parseAccessSchedule,
  parseRateLimits,
  parseAllowedConnections,
  parseAllowedQuotas,
  parseStringList,
  parseNullableTimestamp,
  parseIsBanned,
  parseStreamDefaultMode,
  parseCacheDefaultMode,
  parseChaosModeEnabled,
  parseCompressionEnabled,
  parseAllowAutoCombos,
  parseCatalogScope,
  parseModelAccessMode,
} from "./apiKeys/rowParsers";
import {
  clearModelPermissionCache,
  getCachedModelPermission,
  setCachedModelPermission,
  evictModelPermissionCache,
} from "./apiKeys/modelPermissionCache";
import type { ModelAccessMode } from "./apiKeys/modelAccessMode";
import { applyApiKeyPermissionsUpdate } from "./apiKeys/permissionsMutation";
import {
  normalizeApiKeyPermissionsUpdate,
  type ApiKeyPermissionsUpdate,
} from "./apiKeys/permissionsUpdate";
import { getModelCatalogCacheVersion } from "./readCache";
import type { AccessSchedule, RateLimitRule } from "./apiKeys/types";

// ──────────────── Performance Optimizations ────────────────

// Schema check memoization - only run once
let _schemaChecked = false;

type JsonRecord = Record<string, unknown>;

interface CacheEntry<TValue> {
  timestamp: number;
  value: TValue;
}

interface CreateApiKeyOptions {
  modelAccessMode?: ModelAccessMode;
  allowedModels?: string[];
  allowedCombos?: string[];
  allowedConnections?: string[];
}

export type { AccessSchedule, RateLimitRule } from "./apiKeys/types";

interface ApiKeyMetadata {
  id: string;
  name: string;
  machineId: string | null;
  modelAccessMode: ModelAccessMode;
  allowedModels: string[];
  blockedModels: string[];
  allowedCombos: string[];
  allowedConnections: string[];
  allowedQuotas: string[];
  noLog: boolean;
  autoResolve: boolean;
  isActive: boolean;
  accessSchedule: AccessSchedule | null;
  maxRequestsPerDay: number | null;
  maxRequestsPerMinute: number | null;
  throttleDelayMs: number | null;
  rateLimits: RateLimitRule[] | null;
  maxSessions: number;
  revokedAt: string | null;
  expiresAt: string | null;
  ipAllowlist: string[];
  scopes: string[];
  isBanned: boolean;
  keyHash: string | null;
  proxyId: string | null;
  allowedEndpoints: string[];
  streamDefaultMode: "legacy" | "json";
  cacheDefaultMode: "legacy" | "bypass";
  disableNonPublicModels: boolean;
  allowUsageCommand: boolean;
  usageLimitEnabled: boolean;
  dailyUsageLimitUsd: number | null;
  weeklyUsageLimitUsd: number | null;
  chaosModeEnabled: boolean;
  compressionEnabled: boolean;
  allowAutoCombos: boolean;
  catalogScope: "all" | "combos" | "models";
}

interface ApiKeyRow extends JsonRecord {
  id?: unknown;
  name?: unknown;
  key?: unknown;
  key_ciphertext?: unknown;
  keyCiphertext?: unknown;
  machine_id?: unknown;
  machineId?: unknown;
  allowed_models?: unknown;
  allowedModels?: unknown;
  model_access_mode?: unknown;
  modelAccessMode?: unknown;
  blocked_models?: unknown;
  blockedModels?: unknown;
  allowed_combos?: unknown;
  allowedCombos?: unknown;
  allowed_connections?: unknown;
  allowedConnections?: unknown;
  allowed_quotas?: unknown;
  allowedQuotas?: unknown;
  no_log?: unknown;
  noLog?: unknown;
  auto_resolve?: unknown;
  autoResolve?: unknown;
  is_active?: unknown;
  isActive?: unknown;
  access_schedule?: unknown;
  accessSchedule?: unknown;
  rate_limits?: unknown;
  rateLimits?: unknown;
  proxy_id?: unknown;
  stream_default_mode?: unknown;
  streamDefaultMode?: unknown;
  cache_default_mode?: unknown;
  cacheDefaultMode?: unknown;
  allow_usage_command?: unknown;
  allowUsageCommand?: unknown;
  usage_limit_enabled?: unknown;
  usageLimitEnabled?: unknown;
  daily_usage_limit_usd?: unknown;
  dailyUsageLimitUsd?: unknown;
  weekly_usage_limit_usd?: unknown;
  weeklyUsageLimitUsd?: unknown;
  chaos_mode_enabled?: unknown;
  chaosModeEnabled?: unknown;
  compression_enabled?: unknown;
  compressionEnabled?: unknown;
  allow_auto_combos?: unknown;
  allowAutoCombos?: unknown;
  catalog_scope?: unknown;
  catalogScope?: unknown;
}

interface StatementLike<TRow = unknown> {
  all: (...params: unknown[]) => TRow[];
  get: (...params: unknown[]) => TRow | undefined;
  run: (...params: unknown[]) => { changes?: number };
}

interface ApiKeysDbLike {
  prepare: <TRow = unknown>(sql: string) => StatementLike<TRow>;
  exec: (sql: string) => void;
}

interface ApiKeysStatements {
  getAllKeys: StatementLike<ApiKeyRow>;
  getKeyById: StatementLike<ApiKeyRow>;
  validateKey: StatementLike<JsonRecord>;
  getKeyMetadata: StatementLike<ApiKeyRow>;
  insertKey: StatementLike;
  deleteKey: StatementLike;
}

interface ApiKeyView extends JsonRecord {
  id?: string;
  modelAccessMode: ModelAccessMode;
  allowedModels: string[];
  blockedModels: string[];
  allowedCombos: string[];
  allowedConnections: string[];
  allowedQuotas: string[];
  noLog: boolean;
  autoResolve: boolean;
  isActive: boolean;
  accessSchedule: AccessSchedule | null;
  throttleDelayMs?: number | null;
  rateLimits: RateLimitRule[] | null;
  scopes: string[];
  proxyId?: string | null;
  isBanned?: boolean;
  expiresAt?: string | null;
  allowedEndpoints: string[];
  streamDefaultMode: "legacy" | "json";
  cacheDefaultMode: "legacy" | "bypass";
  disableNonPublicModels?: boolean;
  allowUsageCommand?: boolean;
  usageLimitEnabled?: boolean;
  dailyUsageLimitUsd?: number | null;
  weeklyUsageLimitUsd?: number | null;
  chaosModeEnabled?: boolean;
  compressionEnabled: boolean;
  allowAutoCombos: boolean;
  catalogScope: "all" | "combos" | "models";
}

// LRU cache for API key validation (valid keys only)
const _keyValidationCache = new Map<string, { valid: boolean; timestamp: number }>();
const _keyMetadataCache = new Map<string, CacheEntry<ApiKeyMetadata>>();
const _lastUsedUpdateCache = new Map<string, number>();
const CACHE_TTL = 60 * 1000; // 1 minute TTL
const LAST_USED_UPDATE_TTL = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 1000;
const EXCLUSIVE_LEASE_SCOPE = "lease:exclusive";

export class ApiKeyPolicyInvariantError extends Error {
  readonly code = "LEASE_KEY_POLICY_INVALID";
}

function assertExclusiveLeaseKeyPolicy(
  scopes: readonly string[],
  allowedConnections: readonly string[]
): void {
  if (scopes.includes(EXCLUSIVE_LEASE_SCOPE) && allowedConnections.length === 0) {
    throw new ApiKeyPolicyInvariantError("lease:exclusive requires explicit allowedConnections");
  }
}

// Prepared statements cache
let _stmtGetAllKeys: ApiKeysStatements["getAllKeys"] | null = null;
let _stmtGetKeyById: ApiKeysStatements["getKeyById"] | null = null;
let _stmtValidateKey: ApiKeysStatements["validateKey"] | null = null;
let _stmtGetKeyMetadata: ApiKeysStatements["getKeyMetadata"] | null = null;
let _stmtInsertKey: ApiKeysStatements["insertKey"] | null = null;
let _stmtDeleteKey: ApiKeysStatements["deleteKey"] | null = null;

/**
 * Clear all caches (called on key create/update/delete)
 */
function invalidateCaches() {
  _keyValidationCache.clear();
  _keyMetadataCache.clear();
  clearModelPermissionCache();
  _lastUsedUpdateCache.clear();
}

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function isConfiguredEnvApiKey(key: string): boolean {
  const envKey = process.env.AGENTPROXY_API_KEY || process.env.ROUTER_API_KEY;
  return Boolean(envKey && key === envKey);
}

function isRedisAuthCacheEnabled(): boolean {
  return process.env.AGENTPROXY_DISABLE_REDIS_AUTH_CACHE !== "1" && process.env.NODE_ENV !== "test";
}

async function deleteRedisAuthCacheEntry(keyHash: unknown): Promise<void> {
  if (!isRedisAuthCacheEnabled() || typeof keyHash !== "string" || keyHash.trim() === "") return;

  try {
    const { getRedisClient, isRedisConfigured } = await import("@/shared/utils/rateLimiter");
    if (!isRedisConfigured()) return;
    const redis = await getRedisClient();
    await redis.del(`auth:api_key:${keyHash}`);
  } catch {
    // Redis is an optimization for auth caching; SQLite remains authoritative.
  }
}

async function deleteRedisAuthCacheEntries(...keyHashes: unknown[]): Promise<void> {
  await Promise.all(keyHashes.map((keyHash) => deleteRedisAuthCacheEntry(keyHash)));
}

async function deleteRedisAuthCacheForKeyId(db: ApiKeysDbLike, id: string): Promise<void> {
  if (!isRedisAuthCacheEnabled()) return;

  const row = db
    .prepare<{ key_hash: string | null }>("SELECT key_hash FROM api_keys WHERE id = ?")
    .get(id);
  await deleteRedisAuthCacheEntry(row?.key_hash);
}

function markApiKeyUsed(db: ApiKeysDbLike, id: unknown, now: number): void {
  if (typeof id !== "string" || id.trim() === "") return;

  const lastUpdate = _lastUsedUpdateCache.get(id);
  if (lastUpdate && now - lastUpdate < LAST_USED_UPDATE_TTL) return;

  db.prepare("UPDATE api_keys SET last_used_at = @lastUsedAt WHERE id = @id").run({
    id,
    lastUsedAt: new Date(now).toISOString(),
  });
  _lastUsedUpdateCache.set(id, now);
}

function evictIfNeeded<TKey, TValue>(cache: Map<TKey, TValue>) {
  if (cache.size > MAX_CACHE_SIZE) {
    const entriesToRemove = Math.floor(MAX_CACHE_SIZE * 0.2);
    let i = 0;
    for (const key of cache.keys()) {
      if (i++ >= entriesToRemove) break;
      cache.delete(key);
    }
  }
}

async function getModelPermissionCandidates(modelId: string): Promise<string[]> {
  const candidates = new Set<string>();
  addModelCandidate(candidates, modelId);

  const cleanModelId = stripExtendedContextSuffix(modelId.trim());
  if (!cleanModelId) return Array.from(candidates);

  if (cleanModelId.includes("/")) {
    const firstSlash = cleanModelId.indexOf("/");
    const providerOrAlias = cleanModelId.slice(0, firstSlash);
    const providerScopedModel = cleanModelId.slice(firstSlash + 1);
    if (CLAUDE_CODE_PROVIDER_PREFIXES.has(providerOrAlias) && providerScopedModel) {
      addModelCandidate(candidates, providerScopedModel);
      addModelCandidate(candidates, `cc/${providerScopedModel}`);
      addModelCandidate(candidates, `claude/${providerScopedModel}`);
    }
    if (providerScopedModel) {
      addProviderAliasScopedCandidates(
        candidates,
        providerOrAlias,
        providerScopedModel,
        resolveProviderId,
        getProviderAlias
      );
    }
    return Array.from(candidates);
  }

  if (
    isPotentialUnprefixedClaudeCodeModel(cleanModelId) &&
    (await preferClaudeCodeForUnprefixedClaudeModels())
  ) {
    addModelCandidate(candidates, `cc/${cleanModelId}`);
    addModelCandidate(candidates, `claude/${cleanModelId}`);
  }

  return Array.from(candidates);
}

export async function isModelBlockedByPatterns(
  blockedModels: string[] | null | undefined,
  modelId: string
): Promise<boolean> {
  if (!blockedModels?.length) return false;
  const candidates = await getModelPermissionCandidates(modelId);
  return blockedModels.some((pattern) => modelPatternMatches(pattern, candidates));
}

async function getPublishedModelLookupTarget(
  modelId: string
): Promise<{ providerId: string; modelId: string } | null> {
  const cleanModelId = stripExtendedContextSuffix(modelId.trim());
  if (!cleanModelId) return null;

  if (cleanModelId.includes("/")) {
    const firstSlash = cleanModelId.indexOf("/");
    const providerOrAlias = cleanModelId.slice(0, firstSlash);
    const providerScopedModel = cleanModelId.slice(firstSlash + 1);
    if (!providerScopedModel) return null;
    const providerId = CLAUDE_CODE_PROVIDER_PREFIXES.has(providerOrAlias)
      ? "claude"
      : providerOrAlias;
    return { providerId, modelId: providerScopedModel };
  }

  if (
    isPotentialUnprefixedClaudeCodeModel(cleanModelId) &&
    (await preferClaudeCodeForUnprefixedClaudeModels())
  ) {
    return { providerId: "claude", modelId: cleanModelId };
  }

  return null;
}

function ensureApiKeyColumn(
  db: ApiKeysDbLike,
  columnNames: Set<string>,
  column: (typeof API_KEY_COLUMN_FALLBACKS)[number]
): void {
  if (columnNames.has(column.name)) return;
  db.exec(`ALTER TABLE api_keys ADD COLUMN ${column.definition}`);
  console.log(`[DB] Added api_keys.${column.name} column`);
}

function hashKeySync(key: string): string {
  if (!key || typeof key !== "string") return "";
  return createHash("sha256").update(key).digest("hex");
}

function ensureLegacyApiKeyHashMetadata(db: ApiKeysDbLike): void {
  const rows = db
    .prepare<ApiKeyRow>(
      "SELECT id, key, key_hash, key_prefix FROM api_keys WHERE key_hash IS NULL OR key_prefix IS NULL"
    )
    .all();
  const update = db.prepare(
    "UPDATE api_keys SET key_hash = COALESCE(key_hash, ?), key_prefix = COALESCE(key_prefix, ?) WHERE id = ?"
  );
  for (const row of rows) {
    if (
      typeof row.id !== "string" ||
      typeof row.key !== "string" ||
      isApiKeyStorageSentinel(row.key)
    ) {
      continue;
    }
    update.run(hashKeySync(row.key), row.key.slice(0, 12), row.id);
  }
}

function ensureApiKeysColumns(db: ApiKeysDbLike, migrateLegacy = true) {
  if (_schemaChecked) return;

  try {
    const columns = db.prepare<ApiKeyRow>("PRAGMA table_info(api_keys)").all();
    const columnNames = new Set(columns.map((column) => String(column.name ?? "")));
    for (const column of API_KEY_COLUMN_FALLBACKS) {
      ensureApiKeyColumn(db, columnNames, column);
    }
    // Hash/prefix become authoritative before plaintext conversion so request
    // authentication remains available even when vault recovery is unavailable.
    ensureLegacyApiKeyHashMetadata(db);
    _schemaChecked = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[DB] Failed to verify api_keys schema:", message);
    return;
  }

  if (migrateLegacy) {
    try {
      const migrated = migrateLegacyApiKeyVaultRowsForDb(db);
      if (migrated > 0) {
        console.log("[DB] Migrated " + migrated + " legacy API key bearer(s) into the vault");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("[DB] API key vault migration deferred:", message);
    }
  }
}

let _stmtDb: ApiKeysDbLike | null = null;
function getPreparedStatements(db: ApiKeysDbLike): ApiKeysStatements {
  ensureApiKeysColumns(db);

  if (
    !_stmtGetAllKeys ||
    !_stmtGetKeyById ||
    !_stmtValidateKey ||
    !_stmtGetKeyMetadata ||
    !_stmtInsertKey ||
    !_stmtDeleteKey ||
    _stmtDb !== db
  ) {
    _stmtDb = db;
    _stmtGetAllKeys = db.prepare<ApiKeyRow>("SELECT * FROM api_keys ORDER BY created_at");
    _stmtGetKeyById = db.prepare<ApiKeyRow>("SELECT * FROM api_keys WHERE id = ?");
    _stmtValidateKey = db.prepare<JsonRecord>(
      "SELECT id, expires_at, revoked_at, is_active, is_banned FROM api_keys WHERE key_hash = ?"
    );
    _stmtGetKeyMetadata = db.prepare<ApiKeyRow>(
      "SELECT id, name, machine_id, model_access_mode, allowed_models, blocked_models, allowed_combos, allowed_connections, allowed_quotas, no_log, auto_resolve, is_active, access_schedule, max_requests_per_day, max_requests_per_minute, throttle_delay_ms, max_sessions, revoked_at, expires_at, ip_allowlist, scopes, rate_limits, is_banned, key_hash, allowed_endpoints, stream_default_mode, cache_default_mode, disable_non_public_models, allow_usage_command, usage_limit_enabled, daily_usage_limit_usd, weekly_usage_limit_usd, chaos_mode_enabled, compression_enabled, allow_auto_combos, catalog_scope, proxy_id FROM api_keys WHERE key_hash = ?"
    );
    _stmtInsertKey = db.prepare(
      "INSERT INTO api_keys (id, name, key, key_ciphertext, machine_id, model_access_mode, allowed_models, allowed_combos, allowed_connections, no_log, created_at, key_prefix, key_hash, scopes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    _stmtDeleteKey = db.prepare("DELETE FROM api_keys WHERE id = ?");
  }

  if (
    !_stmtGetAllKeys ||
    !_stmtGetKeyById ||
    !_stmtValidateKey ||
    !_stmtGetKeyMetadata ||
    !_stmtInsertKey ||
    !_stmtDeleteKey
  ) {
    throw new Error("Failed to initialize API key prepared statements");
  }

  return {
    getAllKeys: _stmtGetAllKeys,
    getKeyById: _stmtGetKeyById,
    validateKey: _stmtValidateKey,
    getKeyMetadata: _stmtGetKeyMetadata,
    insertKey: _stmtInsertKey,
    deleteKey: _stmtDeleteKey,
  };
}

export async function getApiKeys(limit?: number, offset?: number) {
  const db = getDbInstance() as ApiKeysDbLike;
  let rows: ApiKeyRow[];
  if (limit !== undefined) {
    const sql = "SELECT * FROM api_keys ORDER BY created_at LIMIT ? OFFSET ?";
    rows = db.prepare(sql).all(limit, offset ?? 0) as ApiKeyRow[];
  } else {
    const stmt = getPreparedStatements(db);
    rows = stmt.getAllKeys.all();
  }
  return rows.map((row) => {
    const camelRow = toRecord(rowToCamel(row)) as ApiKeyView;
    camelRow.modelAccessMode = parseModelAccessMode(
      camelRow.modelAccessMode,
      camelRow.allowedModels
    );
    camelRow.allowedModels = parseAllowedModels(camelRow.allowedModels);
    camelRow.blockedModels = parseAllowedModels(camelRow.blockedModels);
    camelRow.allowedCombos = parseAllowedCombos(camelRow.allowedCombos);
    camelRow.allowedConnections = parseAllowedConnections(camelRow.allowedConnections);
    camelRow.allowedQuotas = parseAllowedQuotas((camelRow as JsonRecord).allowedQuotas);
    camelRow.noLog = parseNoLog(camelRow.noLog);
    camelRow.autoResolve = parseAutoResolve(camelRow.autoResolve);
    camelRow.isActive = parseIsActive(camelRow.isActive);
    camelRow.accessSchedule = parseAccessSchedule(camelRow.accessSchedule);
    camelRow.rateLimits = parseRateLimits(camelRow.rateLimits);
    camelRow.isBanned = parseIsBanned(camelRow.isBanned);
    camelRow.scopes = parseStringList((camelRow as JsonRecord).scopes);
    camelRow.allowedEndpoints = parseStringList((camelRow as JsonRecord).allowedEndpoints);
    camelRow.streamDefaultMode = parseStreamDefaultMode((camelRow as JsonRecord).streamDefaultMode);
    camelRow.cacheDefaultMode = parseCacheDefaultMode((camelRow as JsonRecord).cacheDefaultMode);
    camelRow.disableNonPublicModels = parseDisableNonPublicModels(
      (camelRow as JsonRecord).disableNonPublicModels
    );
    camelRow.allowUsageCommand = parseAllowUsageCommand((camelRow as JsonRecord).allowUsageCommand);
    camelRow.chaosModeEnabled = parseChaosModeEnabled((camelRow as JsonRecord).chaosModeEnabled);
    camelRow.compressionEnabled = parseCompressionEnabled(
      (camelRow as JsonRecord).compressionEnabled
    );
    camelRow.allowAutoCombos = parseAllowAutoCombos((camelRow as JsonRecord).allowAutoCombos);
    camelRow.catalogScope = parseCatalogScope((camelRow as JsonRecord).catalogScope);
    Object.assign(camelRow, parseApiKeyUsageLimitFields(camelRow));
    if (typeof camelRow.id === "string" && camelRow.id.length > 0) {
      setNoLog(camelRow.id, camelRow.noLog === true);
    }
    return camelRow;
  });
}

export function getApiKeysCount(): number {
  const db = getDbInstance() as ApiKeysDbLike;
  const row = db.prepare("SELECT count(*) as cnt FROM api_keys").get() as { cnt: number };
  return row.cnt;
}

/** Derived lease-only membership from existing key policy, not a second pool store. */
export async function getExclusiveLeaseConnectionIds(): Promise<Set<string>> {
  ensureApiKeysColumns(getDbInstance() as ApiKeysDbLike);
  const rows = (getDbInstance() as ApiKeysDbLike)
    .prepare<ApiKeyRow>(
      `SELECT allowed_connections FROM api_keys
       WHERE is_active != 0 AND is_banned != 1 AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?) AND scopes LIKE ?`
    )
    .all(new Date().toISOString(), `%"${EXCLUSIVE_LEASE_SCOPE}"%`);
  return new Set(rows.flatMap((row) => parseAllowedConnections(row.allowed_connections)));
}

/**
 * Select an API key for internal AgentProxy operations (combo health checks,
 * cloud-sync verify pings, etc.).
 *
 * Naive selection of `getApiKeys()[0]` is unsafe because the first row is
 * whatever happened to be inserted first — usually a regular `self:usage`
 * key with a restricted model allowlist. Internal probes that reuse that
 * key to call `/v1/chat/completions` then hit
 *   Model "X" is not allowed for this API key
 * from `shared/utils/apiKeyPolicy.ts` even when the upstream combo path is
 * healthy. Likewise, cloud-sync verify pings flip to "disconnected"
 * because the arbitrary key is rejected upstream.
 *
 * Selection rules (first match wins):
 *   1. Active, non-revoked key whose `scopes` includes "manage"
 *      (management keys are by policy not subject to model allowlists).
 *   2. Active, non-revoked key with empty allowedModels (allow-all).
 *   3. Active, non-revoked key with the most recent `lastUsedAt`.
 *   4. First active, non-revoked key (legacy fallback — preserves prior
 *      behavior when no key matches the better rules above).
 *
 * The selector is deliberately conservative: it never promotes a revoked,
 * inactive, banned, or hard-lease key, and it never widens a key's allowedModels.
 */
export async function pickApiKeyForInternalUse(
  purpose: "combo-health-check" | "cloud-sync-verify" | "internal-probe" = "internal-probe"
): Promise<string | null> {
  try {
    const keys = (await getApiKeys()) as Array<{
      id?: string;
      isActive?: boolean;
      revokedAt?: string | null;
      isBanned?: boolean;
      scopes?: string[];
      modelAccessMode?: ModelAccessMode;
      allowedModels?: string[];
      lastUsedAt?: string | number | null;
    }>;

    const usable = keys.filter(
      (k) =>
        typeof k.id === "string" &&
        k.isActive !== false &&
        !k.revokedAt &&
        k.isBanned !== true &&
        !k.scopes?.includes(EXCLUSIVE_LEASE_SCOPE)
    );

    const ranked: typeof usable = [];
    const pushUnique = (candidate: (typeof usable)[number] | undefined) => {
      if (candidate && !ranked.some((entry) => entry.id === candidate.id)) ranked.push(candidate);
    };

    pushUnique(usable.find((k) => Array.isArray(k.scopes) && k.scopes.includes("manage")));
    pushUnique(
      usable.find(
        (k) =>
          k.modelAccessMode !== "restricted" &&
          Array.isArray(k.allowedModels) &&
          k.allowedModels.length === 0
      )
    );
    for (const candidate of [...usable].sort((a, b) => {
      const aT =
        typeof a.lastUsedAt === "number"
          ? a.lastUsedAt
          : Date.parse(String(a.lastUsedAt ?? "")) || 0;
      const bT =
        typeof b.lastUsedAt === "number"
          ? b.lastUsedAt
          : Date.parse(String(b.lastUsedAt ?? "")) || 0;
      return bT - aT;
    })) {
      pushUnique(candidate);
    }

    for (const candidate of ranked) {
      try {
        const recovered = await recoverApiKeyById(candidate.id!);
        if (recovered) return recovered;
      } catch {
        // Skip an unrecoverable candidate; selection metadata itself remains non-secret.
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getApiKeyById(id: string) {
  const db = getDbInstance() as ApiKeysDbLike;
  const stmt = getPreparedStatements(db);
  const row = stmt.getKeyById.get(id);
  if (!row) return null;
  const camelRow = toRecord(rowToCamel(row)) as ApiKeyView;
  camelRow.modelAccessMode = parseModelAccessMode(camelRow.modelAccessMode, camelRow.allowedModels);
  camelRow.allowedModels = parseAllowedModels(camelRow.allowedModels);
  camelRow.blockedModels = parseAllowedModels(camelRow.blockedModels);
  camelRow.allowedCombos = parseAllowedCombos(camelRow.allowedCombos);
  camelRow.allowedConnections = parseAllowedConnections(camelRow.allowedConnections);
  camelRow.allowedQuotas = parseAllowedQuotas((camelRow as JsonRecord).allowedQuotas);
  camelRow.noLog = parseNoLog(camelRow.noLog);
  camelRow.autoResolve = parseAutoResolve(camelRow.autoResolve);
  camelRow.isActive = parseIsActive(camelRow.isActive);
  camelRow.accessSchedule = parseAccessSchedule(camelRow.accessSchedule);
  camelRow.rateLimits = parseRateLimits(camelRow.rateLimits);
  camelRow.isBanned = parseIsBanned(camelRow.isBanned);
  camelRow.scopes = parseStringList((camelRow as JsonRecord).scopes);
  camelRow.allowedEndpoints = parseStringList((camelRow as JsonRecord).allowedEndpoints);
  camelRow.streamDefaultMode = parseStreamDefaultMode((camelRow as JsonRecord).streamDefaultMode);
  camelRow.cacheDefaultMode = parseCacheDefaultMode((camelRow as JsonRecord).cacheDefaultMode);
  camelRow.disableNonPublicModels = parseDisableNonPublicModels(
    (camelRow as JsonRecord).disableNonPublicModels
  );
  camelRow.allowUsageCommand = parseAllowUsageCommand((camelRow as JsonRecord).allowUsageCommand);
  camelRow.chaosModeEnabled = parseChaosModeEnabled((camelRow as JsonRecord).chaosModeEnabled);
  camelRow.compressionEnabled = parseCompressionEnabled(
    (camelRow as JsonRecord).compressionEnabled
  );
  camelRow.allowAutoCombos = parseAllowAutoCombos((camelRow as JsonRecord).allowAutoCombos);
  camelRow.catalogScope = parseCatalogScope((camelRow as JsonRecord).catalogScope);
  Object.assign(camelRow, parseApiKeyUsageLimitFields(camelRow));
  if (typeof camelRow.id === "string" && camelRow.id.length > 0) {
    setNoLog(camelRow.id, camelRow.noLog === true);
  }
  return camelRow;
}

async function hashKey(key: string): Promise<string> {
  // CodeQL: This is intentionally SHA-256, NOT password hashing. API keys are
  // high-entropy random tokens (not user-chosen passwords) and need fast O(1)
  // comparison for per-request validation. bcrypt/scrypt would add ~100ms per
  // request, which is unacceptable for an API proxy.
  // lgtm[js/insufficient-password-hash]
  return hashKeySync(key); // nosemgrep: insufficient-password-hash
}

interface RecoverableApiKeyRow extends ApiKeyRow {
  id?: unknown;
  key?: unknown;
  key_hash?: unknown;
  key_prefix?: unknown;
  key_ciphertext?: unknown;
}

function verifyRecoveredBearer(row: RecoverableApiKeyRow, bearer: string): void {
  const expectedHash = typeof row.key_hash === "string" ? row.key_hash : hashKeySync(bearer);
  const expectedPrefix = typeof row.key_prefix === "string" ? row.key_prefix : bearer.slice(0, 12);
  if (hashKeySync(bearer) !== expectedHash || bearer.slice(0, 12) !== expectedPrefix) {
    throw new ApiKeyVaultError("API key vault recovery failed hash/prefix verification");
  }
}

function recoverOrMigrateApiKeyRow(db: ApiKeysDbLike, row: RecoverableApiKeyRow): string {
  if (typeof row.id !== "string") {
    throw new ApiKeyVaultError("API key vault recovery requires a stable row id");
  }

  if (typeof row.key_ciphertext === "string" && row.key_ciphertext) {
    const bearer = decryptApiKeyBearer(row.id, row.key_ciphertext);
    verifyRecoveredBearer(row, bearer);
    return bearer;
  }

  if (typeof row.key !== "string" || !row.key || isApiKeyStorageSentinel(row.key)) {
    throw new ApiKeyVaultError("API key bearer is not recoverable with the current vault state");
  }

  const bearer = row.key;
  const hash =
    typeof row.key_hash === "string" && row.key_hash ? row.key_hash : hashKeySync(bearer);
  const prefix =
    typeof row.key_prefix === "string" && row.key_prefix ? row.key_prefix : bearer.slice(0, 12);
  if (hashKeySync(bearer) !== hash || bearer.slice(0, 12) !== prefix) {
    throw new ApiKeyVaultError("Legacy API key hash/prefix verification failed");
  }

  const ciphertext = encryptApiKeyBearer(row.id, bearer);
  if (decryptApiKeyBearer(row.id, ciphertext) !== bearer) {
    throw new ApiKeyVaultError("API key vault round-trip verification failed");
  }
  const sentinel = buildApiKeyStorageSentinel(bearer, hash);
  const result = db
    .prepare(
      "UPDATE api_keys SET key = ?, key_hash = ?, key_prefix = ?, key_ciphertext = ? WHERE id = ? AND key = ? AND key_ciphertext IS NULL"
    )
    .run(sentinel, hash, prefix, ciphertext, row.id, bearer);
  if (result.changes !== 1) {
    throw new ApiKeyVaultError("Legacy API key migration lost its compare-and-swap precondition");
  }
  return bearer;
}

export async function recoverApiKeyById(id: string): Promise<string | null> {
  const db = getDbInstance() as ApiKeysDbLike;
  ensureApiKeysColumns(db);
  const row = db
    .prepare<RecoverableApiKeyRow>(
      "SELECT id, key, key_hash, key_prefix, key_ciphertext FROM api_keys WHERE id = ?"
    )
    .get(id);
  if (!row || typeof row.id !== "string") return null;
  return recoverOrMigrateApiKeyRow(db, row);
}

function migrateLegacyApiKeyVaultRowsForDb(db: ApiKeysDbLike): number {
  const rows = db
    .prepare<RecoverableApiKeyRow>(
      "SELECT id, key, key_hash, key_prefix, key_ciphertext FROM api_keys WHERE key_ciphertext IS NULL"
    )
    .all();
  let migrated = 0;
  for (const row of rows) {
    if (
      typeof row.id !== "string" ||
      typeof row.key !== "string" ||
      isApiKeyStorageSentinel(row.key)
    ) {
      continue;
    }
    try {
      recoverOrMigrateApiKeyRow(db, row);
      migrated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Row ids are non-secret metadata. Never log bearer or ciphertext.
      console.warn("[DB] API key vault migration deferred for " + row.id + ": " + message);
    }
  }
  return migrated;
}

export async function migrateLegacyApiKeyVaultRows(): Promise<number> {
  const db = getDbInstance() as ApiKeysDbLike;
  // Explicit migration owns this pass so its caller gets the migrated count.
  ensureApiKeysColumns(db, false);
  return migrateLegacyApiKeyVaultRowsForDb(db);
}

export async function createApiKey(
  name: string,
  machineId: string,
  scopes: string[] = [],
  options: CreateApiKeyOptions = {}
) {
  if (!machineId) {
    throw new Error("machineId is required");
  }
  const allowedConnections = options.allowedConnections ?? [];
  const modelAccess = normalizeApiKeyPermissionsUpdate({
    modelAccessMode: options.modelAccessMode,
    allowedModels: options.allowedModels,
  });
  const modelAccessMode = modelAccess.modelAccessMode ?? "all";
  const allowedModels = modelAccess.allowedModels ?? [];
  const allowedCombos = options.allowedCombos ?? [ALL_COMBOS_ACCESS_RULE];
  assertExclusiveLeaseKeyPolicy(scopes, allowedConnections);

  const db = getDbInstance() as ApiKeysDbLike;
  const now = new Date().toISOString();

  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const result = generateApiKeyWithMachine(machineId);

  const id = uuidv4();
  const keyHash = hashKeySync(result.key);
  const keyCiphertext = encryptApiKeyBearer(id, result.key);
  if (decryptApiKeyBearer(id, keyCiphertext) !== result.key) {
    throw new ApiKeyVaultError("API key vault round-trip verification failed");
  }
  const storageSentinel = buildApiKeyStorageSentinel(result.key, keyHash);

  const apiKey = {
    id,
    name: name,
    key: result.key,
    machineId: machineId,
    modelAccessMode,
    allowedModels,
    allowedCombos,
    allowedConnections,
    noLog: false,
    allowUsageCommand: false,
    createdAt: now,
    scopes,
  };

  const stmt = getPreparedStatements(db);
  stmt.insertKey.run(
    apiKey.id,
    apiKey.name,
    storageSentinel,
    keyCiphertext,
    apiKey.machineId,
    apiKey.modelAccessMode,
    JSON.stringify(apiKey.allowedModels),
    JSON.stringify(apiKey.allowedCombos),
    JSON.stringify(allowedConnections),
    0,
    apiKey.createdAt,
    apiKey.key.slice(0, 12),
    keyHash,
    JSON.stringify(scopes)
  );
  setNoLog(apiKey.id, false);

  backupDbFile("pre-write");
  return apiKey;
}

export async function regenerateApiKey(id: string) {
  const db = getDbInstance() as ApiKeysDbLike;
  const stmt = getPreparedStatements(db);
  const row = stmt.getKeyById.get(id) as ApiKeyRow | undefined;
  if (!row) return null;

  const { generateApiKeyWithMachine } = await import("@/shared/utils/apiKey");
  const machineId = (row.machine_id || row.machineId || "0000000000000000") as string;
  const { key: newKey } = generateApiKeyWithMachine(machineId);
  const newHash = await hashKey(newKey);
  const newPrefix = newKey.slice(0, 12);
  const newCiphertext = encryptApiKeyBearer(id, newKey);
  if (decryptApiKeyBearer(id, newCiphertext) !== newKey) {
    throw new ApiKeyVaultError("API key vault round-trip verification failed");
  }
  const storageSentinel = buildApiKeyStorageSentinel(newKey, newHash);

  // Update in DB only after strict encryption + round-trip verification succeeds.
  const updateStmt = db.prepare(
    "UPDATE api_keys SET key = ?, key_ciphertext = ?, key_hash = ?, key_prefix = ? WHERE id = ?"
  );
  updateStmt.run(storageSentinel, newCiphertext, newHash, newPrefix, id);

  // Invalidate all caches
  clearApiKeyCaches();

  await deleteRedisAuthCacheEntries(row.key_hash, newHash);

  const { logAuditEvent } = await import("@/lib/compliance");
  logAuditEvent({
    action: "apiKey.regenerate",
    target: id,
    details: { name: String(row.name || "") },
  });

  return { id, key: newKey };
}

export async function updateApiKeyPermissions(
  id: string,
  update: string[] | ApiKeyPermissionsUpdate
) {
  const db = getDbInstance() as ApiKeysDbLike;
  getPreparedStatements(db);
  return applyApiKeyPermissionsUpdate(id, update, {
    db,
    assertExclusiveLeaseKeyPolicy,
    invalidateCaches,
    deleteRedisAuthCacheForKeyId: (keyId) => deleteRedisAuthCacheForKeyId(db, keyId),
  });
}

export async function deleteApiKey(id: string) {
  const db = getDbInstance() as ApiKeysDbLike;
  const stmt = getPreparedStatements(db);
  const row = stmt.getKeyById.get(id) as ApiKeyRow | undefined;
  const result = stmt.deleteKey.run(id);

  if (result.changes === 0) return false;

  db.prepare("DELETE FROM domain_budgets WHERE api_key_id = ?").run(id);
  db.prepare("DELETE FROM domain_cost_history WHERE api_key_id = ?").run(id);
  setNoLog(id, false);

  // Invalidate caches since a key was removed
  invalidateCaches();
  invalidateReasoningRoutingRuleCache();
  await deleteRedisAuthCacheEntry(row?.key_hash);

  backupDbFile("pre-write");
  return true;
}

/**
 * Revoke an API key by id. Logical, not destructive: the row stays so it can
 * be audited, but validateApiKey() rejects it immediately after caches expire
 * (or sooner because invalidateCaches() runs here).
 */
export async function revokeApiKey(id: string): Promise<boolean> {
  const db = getDbInstance() as ApiKeysDbLike;
  getPreparedStatements(db);

  const result = db
    .prepare(
      "UPDATE api_keys SET revoked_at = COALESCE(revoked_at, @ts), is_active = 0 WHERE id = @id"
    )
    .run({ id, ts: new Date().toISOString() });

  if ((result.changes ?? 0) === 0) return false;

  invalidateCaches();
  await deleteRedisAuthCacheForKeyId(db, id);
  backupDbFile("pre-write");
  return true;
}

/**
 * Set or clear the expiry of an API key. Pass null to remove the expiry.
 */
export async function setApiKeyExpiry(id: string, expiresAt: string | null): Promise<boolean> {
  const db = getDbInstance() as ApiKeysDbLike;
  getPreparedStatements(db);

  const result = db
    .prepare("UPDATE api_keys SET expires_at = @expiresAt WHERE id = @id")
    .run({ id, expiresAt });

  if ((result.changes ?? 0) === 0) return false;

  invalidateCaches();
  await deleteRedisAuthCacheForKeyId(db, id);
  backupDbFile("pre-write");
  return true;
}

/**
 * Validate API key with lifecycle gates and caching.
 *
 * A key is valid only when ALL of the following are true:
 *   - the row exists,
 *   - is_active = 1,
 *   - revoked_at IS NULL,
 *   - expires_at IS NULL OR expires_at > now.
 *
 * Cache TTL is short (CACHE_TTL) and the metadata cache is also invalidated
 * by revokeApiKey/updateApiKeyPermissions/deleteApiKey, so a revoke takes
 * effect within at most CACHE_TTL even without an explicit clear in the
 * caller.
 */
export async function validateApiKey(key: string | null | undefined) {
  if (!key || typeof key !== "string") return false;

  if (isConfiguredEnvApiKey(key)) return true;

  const now = Date.now();
  const hashedKey = await hashKey(key);
  const cacheKey = hashedKey;

  const cached = _keyValidationCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.valid;
  }

  if (isRedisAuthCacheEnabled()) {
    // Try Redis cache for multi-instance consistency
    try {
      const { getRedisClient, isRedisConfigured } = await import("@/shared/utils/rateLimiter");
      if (isRedisConfigured()) {
        const redis = await getRedisClient();
        const redisKey = `auth:api_key:${hashedKey}`;
        const redisData = await redis.get(redisKey);
        if (redisData) {
          const data = JSON.parse(redisData);
          const isBanned = !!data.isBanned;
          const isActive = !!data.isActive;
          const revokedAt = data.revokedAt;
          const expiresAt = data.expiresAt;

          if (isBanned || !isActive) return false;
          if (typeof revokedAt === "string" && revokedAt.trim() !== "") return false;
          if (typeof expiresAt === "string" && expiresAt.trim() !== "") {
            const expiresMs = Date.parse(expiresAt);
            if (Number.isFinite(expiresMs) && expiresMs <= now) return false;
          }
          return true;
        }
      }
    } catch {
      // Redis lookup failures fall through to SQLite.
    }
  }

  const db = getDbInstance() as ApiKeysDbLike;
  const stmt = getPreparedStatements(db);
  const row = stmt.validateKey.get(hashedKey) as JsonRecord | undefined;

  if (!row) return false;

  const isBanned = parseIsBanned(row.is_banned ?? row.isBanned);
  if (isBanned) return false;

  const isActive = parseIsActive(row.is_active ?? row.isActive);
  if (!isActive) return false;

  const revokedAt = row.revoked_at ?? row.revokedAt;
  if (typeof revokedAt === "string" && revokedAt.trim() !== "") return false;

  const expiresAt = row.expires_at ?? row.expiresAt;
  if (typeof expiresAt === "string" && expiresAt.trim() !== "") {
    const expiresMs = Date.parse(expiresAt);
    if (Number.isFinite(expiresMs) && expiresMs <= now) return false;
  }

  evictIfNeeded(_keyValidationCache);
  _keyValidationCache.set(cacheKey, { valid: true, timestamp: now });

  if (isRedisAuthCacheEnabled()) {
    // Update Redis cache for fast validation
    try {
      const { getRedisClient, isRedisConfigured } = await import("@/shared/utils/rateLimiter");
      if (isRedisConfigured()) {
        const redis = await getRedisClient();
        const redisKey = `auth:api_key:${hashedKey}`;
        await redis.set(
          redisKey,
          JSON.stringify({
            id: row.id,
            isBanned: parseIsBanned(row.is_banned),
            isActive: parseIsActive(row.is_active),
            expiresAt: row.expires_at,
            revokedAt: row.revoked_at,
          }),
          "EX",
          3600 // 1 hour cache
        );
      }
    } catch {
      // Redis cache update failures do not block successful SQLite validation.
    }
  }

  markApiKeyUsed(db, row.id, now);

  return true;
}

/**
 * Get API key metadata with caching for performance
 */
export async function getApiKeyMetadata(
  key: string | null | undefined
): Promise<ApiKeyMetadata | null> {
  if (!key || typeof key !== "string") return null;

  const now = Date.now();

  // persistent env-var key support (persistent passthrough keys) (#1350)
  if (isConfiguredEnvApiKey(key)) {
    // ─── Env-key management-scope bypass ──────────────────────────────────
    // The deployment-time env key (`AGENTPROXY_API_KEY` / `ROUTER_API_KEY`)
    // is granted the "manage" scope unconditionally. This is intentional:
    //
    //   1. The env key never exists in the SQLite `api_keys` table, so the
    //      DB-backed scopes column does not apply. We synthesize the
    //      metadata record here.
    //   2. The operator who set the env var is presumed to be the deployment
    //      owner; rotating (or unsetting) the env var is the only way to
    //      rotate this privilege. There is no UI to change it.
    //   3. Management API access via the env key still passes through
    //      `requireManagementAuth` → `hasManageScope`, so policy decisions
    //      remain centralised in `src/server/authz/*`.
    //   4. Requests authenticated by the env key are tagged with
    //      `id: "env-key"` for downstream audit-log emitters, making it
    //      possible to distinguish env-key activity from user-created keys
    //      that happen to also hold "manage".
    //
    // DO NOT remove "manage" from this list — that would break the
    // deployment-time bootstrap path that operators rely on for headless
    // / CI / first-boot scenarios. If you need to disable env-key access,
    // unset the env var instead.
    return {
      id: "env-key",
      name: "Environment Key",
      machineId: "server-env",
      modelAccessMode: "all",
      allowedModels: [],
      blockedModels: [],
      allowedCombos: [ALL_COMBOS_ACCESS_RULE],
      allowedConnections: [],
      allowedQuotas: [],
      noLog: false,
      autoResolve: true,
      isActive: true,
      accessSchedule: null,
      rateLimits: null,
      maxRequestsPerDay: null,
      maxRequestsPerMinute: null,
      throttleDelayMs: null,
      maxSessions: 0,
      revokedAt: null,
      expiresAt: null,
      ipAllowlist: [],
      isBanned: false,
      keyHash: null,
      scopes: ["manage"],
      proxyId: null,
      allowedEndpoints: [],
      streamDefaultMode: "legacy",
      cacheDefaultMode: "legacy",
      disableNonPublicModels: false,
      allowUsageCommand: false,
      usageLimitEnabled: false,
      dailyUsageLimitUsd: null,
      weeklyUsageLimitUsd: null,
      chaosModeEnabled: false,
      compressionEnabled: true,
      allowAutoCombos: true,
      catalogScope: "all",
    };
  }

  // Check cache first
  const hashedKey = await hashKey(key);
  const cached = _keyMetadataCache.get(hashedKey);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  const db = getDbInstance() as ApiKeysDbLike;
  const stmt = getPreparedStatements(db);
  const row = stmt.getKeyMetadata.get(hashedKey);

  if (!row) return null;

  const record = toRecord(row) as ApiKeyRow;
  const metadataId = typeof record.id === "string" ? record.id : "";
  const metadataName = typeof record.name === "string" ? record.name : "";
  const machineIdRaw = record.machine_id ?? record.machineId;
  const metadataMachineId = typeof machineIdRaw === "string" ? machineIdRaw : null;

  const rawMaxRPD = record.max_requests_per_day ?? record.maxRequestsPerDay;
  const rawMaxRPM = record.max_requests_per_minute ?? record.maxRequestsPerMinute;
  const rawThrottleDelayMs = record.throttle_delay_ms ?? (record as JsonRecord).throttleDelayMs;

  const rawMaxSessions = record.max_sessions ?? record.maxSessions;

  const rawAllowedModels = record.allowed_models ?? record.allowedModels;
  const metadata: ApiKeyMetadata = {
    id: metadataId,
    name: metadataName,
    machineId: metadataMachineId,
    modelAccessMode: parseModelAccessMode(
      record.model_access_mode ?? record.modelAccessMode,
      rawAllowedModels
    ),
    allowedModels: parseAllowedModels(rawAllowedModels),
    blockedModels: parseAllowedModels(record.blocked_models ?? record.blockedModels),
    allowedCombos: parseAllowedCombos(record.allowed_combos ?? record.allowedCombos),
    allowedConnections: parseAllowedConnections(
      record.allowed_connections ?? record.allowedConnections
    ),
    allowedQuotas: parseAllowedQuotas(
      (record as JsonRecord).allowed_quotas ?? (record as JsonRecord).allowedQuotas
    ),
    noLog: parseNoLog(record.no_log ?? record.noLog),
    autoResolve: parseAutoResolve(record.auto_resolve ?? record.autoResolve),
    isActive: parseIsActive(record.is_active ?? record.isActive),
    accessSchedule: parseAccessSchedule(record.access_schedule ?? record.accessSchedule),
    rateLimits: parseRateLimits(record.rate_limits ?? (record as JsonRecord).rateLimits),
    maxRequestsPerDay: typeof rawMaxRPD === "number" && rawMaxRPD > 0 ? rawMaxRPD : null,
    maxRequestsPerMinute: typeof rawMaxRPM === "number" && rawMaxRPM > 0 ? rawMaxRPM : null,
    throttleDelayMs:
      typeof rawThrottleDelayMs === "number" && rawThrottleDelayMs > 0 ? rawThrottleDelayMs : null,
    // T08: max concurrent sessions; 0 = unlimited (default & backward-compatible)
    maxSessions: typeof rawMaxSessions === "number" && rawMaxSessions > 0 ? rawMaxSessions : 0,
    revokedAt: parseNullableTimestamp(record.revoked_at ?? (record as JsonRecord).revokedAt),
    expiresAt: parseNullableTimestamp(record.expires_at ?? (record as JsonRecord).expiresAt),
    ipAllowlist: parseStringList(record.ip_allowlist ?? (record as JsonRecord).ipAllowlist),
    scopes: parseStringList((record as JsonRecord).scopes),
    isBanned: parseIsBanned(record.is_banned ?? (record as JsonRecord).isBanned),
    keyHash: (record.key_hash ?? (record as JsonRecord).keyHash) as string | null,
    proxyId:
      typeof record.proxy_id === "string" && record.proxy_id.trim() !== "" ? record.proxy_id : null,
    allowedEndpoints: parseStringList(
      (record as JsonRecord).allowed_endpoints ?? (record as JsonRecord).allowedEndpoints
    ),
    streamDefaultMode: parseStreamDefaultMode(
      (record as JsonRecord).stream_default_mode ?? (record as JsonRecord).streamDefaultMode
    ),
    cacheDefaultMode: parseCacheDefaultMode(
      (record as JsonRecord).cache_default_mode ?? (record as JsonRecord).cacheDefaultMode
    ),
    disableNonPublicModels: parseDisableNonPublicModels(
      (record as JsonRecord).disable_non_public_models ??
        (record as JsonRecord).disableNonPublicModels
    ),
    allowUsageCommand: parseAllowUsageCommand(
      (record as JsonRecord).allow_usage_command ?? (record as JsonRecord).allowUsageCommand
    ),
    chaosModeEnabled: parseChaosModeEnabled(
      (record as JsonRecord).chaos_mode_enabled ?? (record as JsonRecord).chaosModeEnabled
    ),
    compressionEnabled: parseCompressionEnabled(
      (record as JsonRecord).compression_enabled ?? (record as JsonRecord).compressionEnabled
    ),
    allowAutoCombos: parseAllowAutoCombos(
      (record as JsonRecord).allow_auto_combos ?? (record as JsonRecord).allowAutoCombos
    ),
    catalogScope: parseCatalogScope(
      (record as JsonRecord).catalog_scope ?? (record as JsonRecord).catalogScope
    ),
    ...parseApiKeyUsageLimitFields(record as JsonRecord),
  };

  if (!metadata.id) {
    return null;
  }

  setNoLog(metadata.id, metadata.noLog === true);

  // Cache the result
  evictIfNeeded(_keyMetadataCache);
  _keyMetadataCache.set(hashedKey, { value: metadata, timestamp: now });

  return metadata;
}

/**
 * Check if a model is allowed for a given API key
 * @param {string} key - The API key
 * @param {string} modelId - The model ID to check
 * @returns {boolean} - true if allowed, false if not
 */
export async function isModelAllowedForKey(
  key: string | null | undefined,
  modelId: string | null | undefined
) {
  // If no key provided, allow (request may be using different auth method like JWT)
  // If no modelId provided, deny (invalid request)
  if (!key) return true;
  if (!modelId) return false;

  // Create cache key
  const cacheKey = `${key}:${modelId}`;
  const now = Date.now();
  const catalogGeneration = getModelCatalogCacheVersion();
  const usesSettingDependentClaudeRouting = isPotentialUnprefixedClaudeCodeModel(modelId);

  // Check permission cache
  const cached = getCachedModelPermission(cacheKey, now, catalogGeneration);
  if (!usesSettingDependentClaudeRouting && cached !== undefined) {
    return cached;
  }

  const metadata = await getApiKeyMetadata(key);
  // SECURITY: Key not found in database = deny access (invalid/non-existent key)
  if (!metadata) return false;

  const { modelAccessMode, allowedModels, blockedModels, disableNonPublicModels } = metadata;
  const modelPermissionCandidates = await getModelPermissionCandidates(modelId);

  // Deny-list patterns win over any allow-list entry. This lets operators keep
  // broad dynamic scopes like cc/* while excluding expensive families.
  if (blockedModels?.some((pattern) => modelPatternMatches(pattern, modelPermissionCandidates))) {
    return false;
  }

  // Check disableNonPublicModels flag
  if (disableNonPublicModels) {
    const resolvedModelId = resolveModelAlias(modelId);
    const effectiveModelId = resolvedModelId || modelId;

    if (!hasClaudeCodeWildcardPermission(allowedModels, modelPermissionCandidates)) {
      const lookupTarget = await getPublishedModelLookupTarget(effectiveModelId);
      const providerId = lookupTarget?.providerId || effectiveModelId.split("/")[0];
      const shortModelId = lookupTarget?.modelId || effectiveModelId.split("/").slice(1).join("/");
      if (!providerId || !shortModelId) return false;

      const [syncedModelsByConnection, customModels] = await Promise.all([
        getSyncedAvailableModelsByConnection(providerId),
        getCustomModels(providerId),
      ]);

      // Combine synced and custom models
      const allDiscoveredModels = Object.values(syncedModelsByConnection)
        .flat()
        .concat(customModels);
      const discovered = allDiscoveredModels.some((m) => m.id === shortModelId);
      if (!discovered) return false;

      const isPublic = !getModelIsHidden(providerId, shortModelId);
      if (!isPublic) return false;
    }
  }

  // Only explicit allow-all permits an empty list; restricted + [] is deny-all.
  // No early return here: group deny rules (checked below) must still apply to
  // keys with an empty per-key allow-list (#8817 regression guard — groups only
  // AND-deny, so restricted+[] stays deny-all).
  // Support exact match and prefix match (e.g., "openai/*" allows all OpenAI models)
  let allowed =
    !allowedModels || allowedModels.length === 0
      ? modelAccessMode !== "restricted"
      : allowedModels.some((pattern) => modelPatternMatches(pattern, modelPermissionCandidates));

  // Extract model target and optional provider prefix if present (e.g. "openai/gpt-4" -> modelTarget: "gpt-4", provider: "openai")
  const hasProviderPrefix = modelId?.includes("/");
  const provider = hasProviderPrefix ? modelId.split("/")[0] : undefined;
  const modelTarget = hasProviderPrefix ? modelId.split("/").slice(1).join("/") : modelId || "";

  // If key belongs to groups, check both modelTarget and full modelId against group rules
  if (metadata.id) {
    const targetOk = checkKeyModelAccess(metadata.id, modelTarget, provider).allowed;
    const fullOk = checkKeyModelAccess(metadata.id, modelId || "", provider).allowed;
    if (!targetOk || !fullOk) allowed = false;
  }
  // Cache the result
  if (!usesSettingDependentClaudeRouting) {
    evictModelPermissionCache();
    setCachedModelPermission(cacheKey, allowed, now, catalogGeneration);
  }

  return allowed;
}

/**
 * Clear prepared statements cache (called on database reset/restore)
 * Prepared statements are bound to a specific database connection,
 * so they must be cleared when the connection is reset.
 */
function clearPreparedStatementCache() {
  _stmtGetAllKeys = null;
  _stmtGetKeyById = null;
  _stmtValidateKey = null;
  _stmtGetKeyMetadata = null;
  _stmtInsertKey = null;
  _stmtDeleteKey = null;
  _schemaChecked = false; // Also reset schema check for new connection
}

/**
 * Clear all caches (exported for testing/debugging)
 */
export function clearApiKeyCaches() {
  invalidateCaches();
}

/**
 * Reset all cached state for database connection reset/restore.
 * Called by backup.ts when the database is restored.
 */
export function resetApiKeyState() {
  clearPreparedStatementCache();
  clearApiKeyCaches();
}

registerDbStateResetter(resetApiKeyState);
