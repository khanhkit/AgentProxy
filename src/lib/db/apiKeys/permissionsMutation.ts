import { backupDbFile } from "../backup";
import { appendUsageLimitUpdates, hasUsageLimitUpdate } from "../apiKeyUsageLimitFields";
import { invalidateModelCatalogCache } from "../readCache";
import { setNoLog } from "../../compliance/noLog";
import type { ModelAccessMode } from "./modelAccessMode";
import {
  normalizeApiKeyPermissionsUpdate,
  type ApiKeyPermissionsUpdate,
} from "./permissionsUpdate";
import {
  parseAllowedConnections,
  parseCacheDefaultMode,
  parseStreamDefaultMode,
  parseStringList,
} from "./rowParsers";

interface StatementLike<TRow = unknown> {
  get: (...params: unknown[]) => TRow | undefined;
  run: (...params: unknown[]) => { changes?: number };
}

export interface ApiKeyPermissionsMutationDb {
  prepare: <TRow = unknown>(sql: string) => StatementLike<TRow>;
  exec: (sql: string) => void;
}

interface MutationDeps {
  db: ApiKeyPermissionsMutationDb;
  assertExclusiveLeaseKeyPolicy: (scopes: string[], allowedConnections: string[]) => void;
  invalidateCaches: () => void;
  deleteRedisAuthCacheForKeyId: (id: string) => Promise<void>;
}

export async function applyApiKeyPermissionsUpdate(
  id: string,
  update: string[] | ApiKeyPermissionsUpdate,
  {
    db,
    assertExclusiveLeaseKeyPolicy,
    invalidateCaches,
    deleteRedisAuthCacheForKeyId,
  }: MutationDeps
) {
  const normalized = normalizeApiKeyPermissionsUpdate(update);
  const shouldInvalidateModelCatalog =
    normalized.modelAccessMode !== undefined ||
    normalized.allowedModels !== undefined ||
    normalized.blockedModels !== undefined ||
    normalized.allowedCombos !== undefined ||
    normalized.allowedConnections !== undefined ||
    normalized.allowedQuotas !== undefined ||
    normalized.disableNonPublicModels !== undefined ||
    normalized.allowAutoCombos !== undefined ||
    normalized.catalogScope !== undefined;

  if (
    normalized.name === undefined &&
    normalized.modelAccessMode === undefined &&
    normalized.allowedModels === undefined &&
    normalized.blockedModels === undefined &&
    normalized.allowedCombos === undefined &&
    normalized.allowedConnections === undefined &&
    (normalized as Record<string, unknown>).allowedQuotas === undefined &&
    normalized.noLog === undefined &&
    normalized.autoResolve === undefined &&
    normalized.isActive === undefined &&
    normalized.accessSchedule === undefined &&
    normalized.maxRequestsPerDay === undefined &&
    normalized.maxRequestsPerMinute === undefined &&
    normalized.throttleDelayMs === undefined &&
    normalized.rateLimits === undefined &&
    normalized.isBanned === undefined &&
    normalized.expiresAt === undefined &&
    (normalized as Record<string, unknown>).maxSessions === undefined &&
    (normalized as Record<string, unknown>).scopes === undefined &&
    (normalized as Record<string, unknown>).proxyId === undefined &&
    (normalized as Record<string, unknown>).allowedEndpoints === undefined &&
    (normalized as Record<string, unknown>).streamDefaultMode === undefined &&
    (normalized as Record<string, unknown>).cacheDefaultMode === undefined &&
    normalized.disableNonPublicModels === undefined &&
    normalized.allowUsageCommand === undefined &&
    normalized.chaosModeEnabled === undefined &&
    normalized.compressionEnabled === undefined &&
    normalized.allowAutoCombos === undefined &&
    normalized.catalogScope === undefined &&
    !hasUsageLimitUpdate(normalized as Record<string, unknown>)
  ) {
    return false;
  }

  const updates: string[] = [];
  const params: {
    id: string;
    name?: string;
    modelAccessMode?: ModelAccessMode;
    allowedModels?: string;
    blockedModels?: string;
    allowedCombos?: string;
    allowedConnections?: string;
    allowedQuotas?: string;
    noLog?: number;
    autoResolve?: number;
    isActive?: number;
    accessSchedule?: string | null;
    maxRequestsPerDay?: number | null;
    maxRequestsPerMinute?: number | null;
    throttleDelayMs?: number | null;
    rateLimits?: string | null;
    isBanned?: number;
    maxSessions?: number;
    expiresAt?: string | null;
    scopes?: string;
    proxyId?: string | null;
    streamDefaultMode?: "legacy" | "json";
    cacheDefaultMode?: "legacy" | "bypass";
    disableNonPublicModels?: number;
    allowUsageCommand?: number;
    usageLimitEnabled?: number;
    dailyUsageLimitUsd?: number | null;
    weeklyUsageLimitUsd?: number | null;
    chaosModeEnabled?: number;
    compressionEnabled?: number;
    allowAutoCombos?: number;
    catalogScope?: "all" | "combos" | "models";
  } = { id };

  if (normalized.name !== undefined) {
    updates.push("name = @name");
    params.name = normalized.name;
  }

  if (normalized.modelAccessMode !== undefined) {
    updates.push("model_access_mode = @modelAccessMode");
    params.modelAccessMode = normalized.modelAccessMode;
  }
  if (normalized.allowedModels !== undefined) {
    updates.push("allowed_models = @allowedModels");
    params.allowedModels = JSON.stringify(normalized.allowedModels);
  }

  if (normalized.blockedModels !== undefined) {
    // Deny-list patterns always take precedence over allowed_models.
    updates.push("blocked_models = @blockedModels");
    params.blockedModels = JSON.stringify(normalized.blockedModels || []);
  }

  if (normalized.allowedCombos !== undefined) {
    // Empty array denies all combos; combo/* explicitly allows all combos.
    updates.push("allowed_combos = @allowedCombos");
    params.allowedCombos = JSON.stringify(normalized.allowedCombos || []);
  }

  if (normalized.allowedConnections !== undefined) {
    // Empty array means all connections are allowed
    updates.push("allowed_connections = @allowedConnections");
    params.allowedConnections = JSON.stringify(normalized.allowedConnections || []);
  }

  const allowedQuotasUpdate = (normalized as Record<string, unknown>).allowedQuotas;
  if (allowedQuotasUpdate !== undefined) {
    // Empty array means no quota-pool restriction; non-empty restricts to listed pools
    updates.push("allowed_quotas = @allowedQuotas");
    const nextQuotas: string[] = Array.isArray(allowedQuotasUpdate)
      ? (allowedQuotasUpdate as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    params.allowedQuotas = JSON.stringify(nextQuotas);
  }

  if (normalized.noLog !== undefined) {
    updates.push("no_log = @noLog");
    params.noLog = normalized.noLog ? 1 : 0;
  }

  if (normalized.autoResolve !== undefined) {
    updates.push("auto_resolve = @autoResolve");
    params.autoResolve = normalized.autoResolve ? 1 : 0;
  }

  if (normalized.isActive !== undefined) {
    updates.push("is_active = @isActive");
    params.isActive = normalized.isActive ? 1 : 0;
  }

  if (normalized.accessSchedule !== undefined) {
    updates.push("access_schedule = @accessSchedule");
    params.accessSchedule =
      normalized.accessSchedule !== null ? JSON.stringify(normalized.accessSchedule) : null;
  }

  if (normalized.maxRequestsPerDay !== undefined) {
    updates.push("max_requests_per_day = @maxRequestsPerDay");
    params.maxRequestsPerDay = normalized.maxRequestsPerDay;
  }

  if (normalized.maxRequestsPerMinute !== undefined) {
    updates.push("max_requests_per_minute = @maxRequestsPerMinute");
    params.maxRequestsPerMinute = normalized.maxRequestsPerMinute;
  }

  if (normalized.throttleDelayMs !== undefined) {
    updates.push("throttle_delay_ms = @throttleDelayMs");
    params.throttleDelayMs = normalized.throttleDelayMs;
  }

  if (normalized.rateLimits !== undefined) {
    updates.push("rate_limits = @rateLimits");
    params.rateLimits =
      normalized.rateLimits !== null ? JSON.stringify(normalized.rateLimits) : null;
  }

  if (normalized.isBanned !== undefined) {
    updates.push("is_banned = @isBanned");
    params.isBanned = normalized.isBanned ? 1 : 0;
  }

  if (normalized.expiresAt !== undefined) {
    updates.push("expires_at = @expiresAt");
    params.expiresAt = normalized.expiresAt;
  }

  if (normalized.disableNonPublicModels !== undefined) {
    updates.push("disable_non_public_models = @disableNonPublicModels");
    params.disableNonPublicModels = normalized.disableNonPublicModels ? 1 : 0;
  }

  if (normalized.allowUsageCommand !== undefined) {
    updates.push("allow_usage_command = @allowUsageCommand");
    params.allowUsageCommand = normalized.allowUsageCommand ? 1 : 0;
  }

  if (normalized.chaosModeEnabled !== undefined) {
    updates.push("chaos_mode_enabled = @chaosModeEnabled");
    params.chaosModeEnabled = normalized.chaosModeEnabled ? 1 : 0;
  }

  if (normalized.compressionEnabled !== undefined) {
    updates.push("compression_enabled = @compressionEnabled");
    params.compressionEnabled = normalized.compressionEnabled ? 1 : 0;
  }

  if (normalized.allowAutoCombos !== undefined) {
    updates.push("allow_auto_combos = @allowAutoCombos");
    params.allowAutoCombos = normalized.allowAutoCombos ? 1 : 0;
  }

  if (normalized.catalogScope !== undefined) {
    updates.push("catalog_scope = @catalogScope");
    params.catalogScope = normalized.catalogScope;
  }

  appendUsageLimitUpdates(normalized as Record<string, unknown>, updates, params);

  const maxSessionsUpdate = (normalized as Record<string, unknown>).maxSessions;
  if (maxSessionsUpdate !== undefined) {
    updates.push("max_sessions = @maxSessions");
    params.maxSessions = typeof maxSessionsUpdate === "number" ? Math.max(0, maxSessionsUpdate) : 0;
  }

  const proxyIdUpdate = (normalized as Record<string, unknown>).proxyId;
  if (proxyIdUpdate !== undefined) {
    updates.push("proxy_id = @proxyId");
    params.proxyId =
      typeof proxyIdUpdate === "string" && proxyIdUpdate.trim() !== "" ? proxyIdUpdate : null;
  }

  const allowedEndpointsUpdate = (normalized as Record<string, unknown>).allowedEndpoints;
  if (allowedEndpointsUpdate !== undefined) {
    updates.push("allowed_endpoints = @allowedEndpoints");
    const nextEndpoints: string[] = Array.isArray(allowedEndpointsUpdate)
      ? (allowedEndpointsUpdate as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    (params as Record<string, unknown>).allowedEndpoints = JSON.stringify(nextEndpoints);
  }

  const streamDefaultModeUpdate = (normalized as Record<string, unknown>).streamDefaultMode;
  if (streamDefaultModeUpdate !== undefined) {
    updates.push("stream_default_mode = @streamDefaultMode");
    params.streamDefaultMode = parseStreamDefaultMode(streamDefaultModeUpdate);
  }

  const cacheDefaultModeUpdate = (normalized as Record<string, unknown>).cacheDefaultMode;
  if (cacheDefaultModeUpdate !== undefined) {
    updates.push("cache_default_mode = @cacheDefaultMode");
    params.cacheDefaultMode = parseCacheDefaultMode(cacheDefaultModeUpdate);
  }

  const scopesUpdate = (normalized as Record<string, unknown>).scopes;
  const nextScopes: string[] = Array.isArray(scopesUpdate)
    ? (scopesUpdate as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  // Capture previous scopes BEFORE the UPDATE so we can compare for the audit
  // event below. We only fetch when the caller is actually changing scopes —
  // a privileged change ("manage" grants management API surface access) that
  // must always leave an audit trail per OWASP A09 / SOC2 CC7.2.
  //
  // The previous-scopes SELECT and the row UPDATE are wrapped in a single
  // transaction so a concurrent writer cannot slip in between and make the
  // audit log lie about what changed. SQLite is single-writer in practice,
  // but the transaction also gives us atomicity if the underlying driver
  // ever swaps to a backend that allows multiple writers (sqljsAdapter /
  // nodeSqliteAdapter fall-back per v3.8.1 db driver cascade).
  let previousScopes: string[] = [];
  let changedRows = 0;
  if (scopesUpdate !== undefined) {
    updates.push("scopes = @scopes");
    params.scopes = JSON.stringify(nextScopes);

    // SELECT-then-UPDATE wrapped in an explicit transaction so a concurrent
    // writer can't slip between the read and the write and make the audit
    // log lie about what changed. `exec("BEGIN"/"COMMIT")` works across all
    // driver backends (better-sqlite3 / node:sqlite / sql.js) wired by the
    // v3.8.1 db driver cascade — none of them expose `db.transaction()` via
    // ApiKeysDbLike, which is intentionally minimal.
    db.exec("BEGIN IMMEDIATE");
    try {
      const prevRow = db
        .prepare<{ scopes: string | null; allowed_connections: string | null }>(
          "SELECT scopes, allowed_connections FROM api_keys WHERE id = ?"
        )
        .get(id);
      if (!prevRow) {
        db.exec("ROLLBACK");
        return false;
      }
      previousScopes = parseStringList(prevRow.scopes);
      const nextAllowedConnections =
        normalized.allowedConnections === undefined
          ? parseAllowedConnections(prevRow.allowed_connections)
          : normalized.allowedConnections;
      assertExclusiveLeaseKeyPolicy(nextScopes, nextAllowedConnections);
      const upd = db
        .prepare(`UPDATE api_keys SET ${updates.join(", ")} WHERE id = @id`)
        .run(params);
      changedRows = upd.changes ?? 0;
      db.exec("COMMIT");
    } catch (err) {
      // Guard the ROLLBACK: if it throws (e.g. transaction already ended
      // due to an implicit commit, or backend in a bad state), the original
      // error from the try block is the actionable one — don't shadow it.
      try {
        db.exec("ROLLBACK");
      } catch {
        // swallow: original error is more important
      }
      throw err;
    }
  } else if (normalized.allowedConnections !== undefined) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = db
        .prepare<{ scopes: string | null }>("SELECT scopes FROM api_keys WHERE id = ?")
        .get(id);
      if (!row) {
        db.exec("ROLLBACK");
        return false;
      }
      assertExclusiveLeaseKeyPolicy(parseStringList(row.scopes), normalized.allowedConnections);
      const upd = db
        .prepare(`UPDATE api_keys SET ${updates.join(", ")} WHERE id = @id`)
        .run(params);
      changedRows = upd.changes ?? 0;
      db.exec("COMMIT");
    } catch (err) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Preserve the mutation failure if rollback also fails.
      }
      throw err;
    }
  } else {
    const upd = db.prepare(`UPDATE api_keys SET ${updates.join(", ")} WHERE id = @id`).run(params);
    changedRows = upd.changes ?? 0;
  }

  if (changedRows === 0) return false;

  const { logAuditEvent } = await import("@/lib/compliance");

  if (normalized.isBanned !== undefined) {
    logAuditEvent({
      action: normalized.isBanned ? "apiKey.ban" : "apiKey.unban",
      target: id,
    });
  }

  if (normalized.isActive !== undefined) {
    logAuditEvent({
      action: normalized.isActive ? "apiKey.activate" : "apiKey.deactivate",
      target: id,
    });
  }

  if (scopesUpdate !== undefined) {
    // Compare prev vs next scope sets and emit a dedicated audit event when
    // the privileged "manage" scope is granted or revoked. Other scope
    // mutations also emit a generic "apiKey.scopes.update" so the audit log
    // captures the full change history (action + details).
    const hadManage = previousScopes.includes("manage");
    const hasManage = nextScopes.includes("manage");
    if (!hadManage && hasManage) {
      logAuditEvent({
        action: "apiKey.scopes.grant",
        target: id,
        details: { scopes: nextScopes, previous: previousScopes },
      });
    } else if (hadManage && !hasManage) {
      logAuditEvent({
        action: "apiKey.scopes.revoke",
        target: id,
        details: { scopes: nextScopes, previous: previousScopes },
      });
    } else if (
      previousScopes.length !== nextScopes.length ||
      previousScopes.some((s) => !nextScopes.includes(s)) ||
      nextScopes.some((s) => !previousScopes.includes(s))
    ) {
      logAuditEvent({
        action: "apiKey.scopes.update",
        target: id,
        details: { scopes: nextScopes, previous: previousScopes },
      });
    }
  }

  if (normalized.noLog !== undefined) {
    setNoLog(id, normalized.noLog);
  }

  // Invalidate per-key policy and filtered model-catalog caches after the atomic write.
  invalidateCaches();
  if (shouldInvalidateModelCatalog) invalidateModelCatalogCache();

  await deleteRedisAuthCacheForKeyId(id);

  backupDbFile("pre-write");
  return true;
}
