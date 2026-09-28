import { getComboModelProvider } from "@/lib/combos/steps";
import { getDbInstance } from "../core";

export const PROXY_ALIVE_PREDICATE =
  "(p.status IS NULL OR LOWER(p.status) NOT IN ('inactive','error','disabled','dead','down'))";

export function isGlobalProxyEnabled(db: ReturnType<typeof getDbInstance>): boolean {
  try {
    const row = db
      .prepare("SELECT value FROM key_value WHERE namespace = 'settings' AND key = 'proxyEnabled'")
      .get() as { value?: string } | undefined;
    if (!row?.value) return true;
    try {
      return JSON.parse(row.value) !== false;
    } catch {
      return true;
    }
  } catch {
    return true;
  }
}

/**
 * #6246 fail-closed guard for a connection with an assigned dead proxy pool.
 * Explicitly disabling proxying globally or for the connection allows direct egress.
 */
export function hasBlockingProxyAssignment(connectionId: string, providerId?: string): boolean {
  try {
    const db = getDbInstance();
    if (!isGlobalProxyEnabled(db)) return false;

    const conn = db
      .prepare("SELECT provider, proxy_enabled FROM provider_connections WHERE id = ?")
      .get(connectionId) as { provider?: string | null; proxy_enabled?: number } | undefined;
    if (conn && conn.proxy_enabled === 0) return false;
    const provider = conn?.provider ?? providerId ?? null;
    const dead = db
      .prepare(
        `SELECT 1 FROM proxy_assignments a JOIN proxy_registry p ON p.id = a.proxy_id
           WHERE ((a.scope = 'account' AND a.scope_id = ?)
               OR (a.scope = 'provider' AND a.scope_id = ?)
               OR (a.scope = 'global'))
             AND NOT ${PROXY_ALIVE_PREDICATE}
           LIMIT 1`
      )
      .get(connectionId, provider);
    if (dead) return true;

    if (provider) {
      const comboRows = db.prepare("SELECT id, data FROM combos").all() as Array<{
        id?: string;
        data?: string;
      }>;
      const relevantComboIds = comboRows.flatMap((row) => {
        if (typeof row.id !== "string" || typeof row.data !== "string") return [];
        try {
          const parsed = JSON.parse(row.data) as { models?: unknown[] };
          return Array.isArray(parsed.models) &&
            parsed.models.some((entry) => getComboModelProvider(entry) === provider)
            ? [row.id]
            : [];
        } catch {
          return [];
        }
      });

      if (relevantComboIds.length > 0) {
        const placeholders = relevantComboIds.map(() => "?").join(",");
        const deadCombo = db
          .prepare(
            `SELECT 1 FROM proxy_assignments a JOIN proxy_registry p ON p.id = a.proxy_id
               WHERE a.scope = 'combo'
                 AND a.scope_id IN (${placeholders})
                 AND NOT ${PROXY_ALIVE_PREDICATE}
               LIMIT 1`
          )
          .get(...relevantComboIds);
        if (deadCombo) return true;
      }
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Fail closed when an account-scoped registry assignment exists but none of its
 * pool members are serviceable. Explicit global/connection proxy-off still wins.
 */
export function hasBlockingAccountProxyAssignment(connectionId: string): boolean {
  try {
    const db = getDbInstance();
    if (!isGlobalProxyEnabled(db)) return false;

    const conn = db
      .prepare("SELECT proxy_enabled FROM provider_connections WHERE id = ?")
      .get(connectionId) as { proxy_enabled?: number } | undefined;
    if (conn && conn.proxy_enabled === 0) return false;

    const assignments = db
      .prepare(
        `SELECT
           EXISTS(
             SELECT 1 FROM proxy_assignments a
             WHERE a.scope = 'account' AND a.scope_id = ?
           ) AS assigned,
           EXISTS(
             SELECT 1 FROM proxy_assignments a JOIN proxy_registry p ON p.id = a.proxy_id
             WHERE a.scope = 'account' AND a.scope_id = ?
               AND ${PROXY_ALIVE_PREDICATE}
           ) AS alive`
      )
      .get(connectionId, connectionId) as { assigned?: number; alive?: number } | undefined;
    return assignments?.assigned === 1 && assignments.alive === 0;
  } catch {
    return false;
  }
}

/**
 * #7380 fail-closed guard for providers without a connection row. Returns true
 * when a provider/global proxy assignment exists but all assigned proxies are known dead.
 */
export function hasBlockingProxyAssignmentForProvider(providerId: string): boolean {
  try {
    const db = getDbInstance();
    if (!isGlobalProxyEnabled(db)) return false;

    const assignments = db
      .prepare(
        `SELECT
           EXISTS(
             SELECT 1 FROM proxy_assignments a
             WHERE ((a.scope = 'provider' AND a.scope_id = ?)
                 OR a.scope = 'global')
           ) AS assigned,
           EXISTS(
             SELECT 1 FROM proxy_assignments a JOIN proxy_registry p ON p.id = a.proxy_id
             WHERE ((a.scope = 'provider' AND a.scope_id = ?)
                 OR a.scope = 'global')
               AND ${PROXY_ALIVE_PREDICATE}
           ) AS alive`
      )
      .get(providerId, providerId) as { assigned?: number; alive?: number } | undefined;
    return assignments?.assigned === 1 && assignments.alive === 0;
  } catch {
    return false;
  }
}
