/**
 * db/proxyLogs.ts — Read queries over the `proxy_logs` table.
 * Extracted from the /api/logs/export route handler.
 *
 * Hard Rule #5: routes must not embed raw SQL — these queries live here so the
 * /api/logs/export route can delegate.
 *
 * NOTE: The SELECT * intentionally returns the historical `public_ip` column,
 * NOT `clientIp`. This differs from GET /api/usage/proxy-logs which exposes
 * the value as `clientIp`. Callers of the export endpoint should read
 * `public_ip`. This inconsistency will be resolved in a future DB migration
 * (#2880).
 *
 * Sliced out of #3500 (proxy_logs cluster, slice 4).
 */

import { getDbInstance } from "./core";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Returns all proxy_logs rows with timestamp >= `since`, ordered by timestamp
 * descending (most recent first).
 *
 * @param since - ISO-8601 timestamp lower bound, e.g. "2024-01-01T00:00:00.000Z".
 */
export interface LegacyProxyLogExportCursor {
  timestamp: string;
  rowId: number;
}

export interface LegacyProxyLogExportRow {
  rowId: number;
  timestamp: string;
  record: Record<string, unknown>;
}

export function getLegacyProxyLogExportMaxRowId(since: string): number {
  const db = getDbInstance();
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(rowid), 0) AS max_row_id FROM proxy_logs WHERE timestamp >= @since"
    )
    .get({ since }) as { max_row_id?: number } | undefined;
  return Number(row?.max_row_id ?? 0);
}

export function getLegacyProxyLogExportPage(
  since: string,
  maxRowId: number,
  cursor: LegacyProxyLogExportCursor | null,
  limit: number
): LegacyProxyLogExportRow[] {
  const db = getDbInstance();
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
  const rows = cursor
    ? db
        .prepare(
          `SELECT rowid AS __row_id, *
             FROM proxy_logs
            WHERE timestamp >= @since
              AND rowid <= @maxRowId
              AND (timestamp < @cursorTimestamp
                   OR (timestamp = @cursorTimestamp AND rowid < @cursorRowId))
            ORDER BY timestamp DESC, rowid DESC
            LIMIT @limit`
        )
        .all({
          since,
          maxRowId,
          cursorTimestamp: cursor.timestamp,
          cursorRowId: cursor.rowId,
          limit: boundedLimit,
        })
    : db
        .prepare(
          `SELECT rowid AS __row_id, *
             FROM proxy_logs
            WHERE timestamp >= @since
              AND rowid <= @maxRowId
            ORDER BY timestamp DESC, rowid DESC
            LIMIT @limit`
        )
        .all({ since, maxRowId, limit: boundedLimit });

  return (rows as Array<Record<string, unknown> & { __row_id: number; timestamp: string }>).map(
    (row) => {
      const { __row_id, ...record } = row;
      return {
        rowId: Number(__row_id),
        timestamp: String(row.timestamp),
        record,
      };
    }
  );
}

export function exportProxyLogsSince(since: string): Record<string, unknown>[] {
  const maxRowId = getLegacyProxyLogExportMaxRowId(since);
  const logs: Record<string, unknown>[] = [];
  let cursor: LegacyProxyLogExportCursor | null = null;

  while (true) {
    const page = getLegacyProxyLogExportPage(since, maxRowId, cursor, 100);
    if (page.length === 0) break;
    logs.push(...page.map((row) => row.record));

    const last = page[page.length - 1];
    cursor = { timestamp: last.timestamp, rowId: last.rowId };
  }

  return logs;
}

export function countProxyLogsSince(since: string): number {
  const db = getDbInstance();
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM proxy_logs WHERE timestamp >= @since")
    .get({ since }) as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

export function* iterateProxyLogsSince(
  since: string,
  limit: number
): Generator<Record<string, unknown>, void, void> {
  const maxRows = Math.max(0, Math.trunc(limit));
  if (maxRows === 0) return;

  const maxRowId = getLegacyProxyLogExportMaxRowId(since);
  let cursor: LegacyProxyLogExportCursor | null = null;
  let processed = 0;

  while (processed < maxRows) {
    const pageLimit = Math.min(100, maxRows - processed);
    const page = getLegacyProxyLogExportPage(since, maxRowId, cursor, pageLimit);
    if (page.length === 0) break;

    for (const row of page) {
      yield row.record;
      processed++;
      if (processed >= maxRows) break;
    }

    const last = page[page.length - 1];
    cursor = { timestamp: last.timestamp, rowId: last.rowId };
    if (page.length < pageLimit) break;
  }
}

// 24h window for "last known egress IP" lookups. This helper answers a
// different question from proxyEgress.ts (#10677): that module reports which
// connections share an egress IP *right now*, derived from their proxy config
// and a live probe (5 min cache), while the lock needs the IP a connection
// actually *left through* on its recent traffic — history, which only
// proxy_logs holds. Hence a local window constant rather than a dependency.
// Exported so callers can build `since` without duplicating the window.
export const EGRESS_IP_LOOKUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PoolEgressObservationCounts = {
  connections: number;
  distinctExits: number;
  maxConnectionsOnOneExit: number;
};

export function getPoolEgressObservation(
  scope: string,
  scopeId: string | null,
  since: string
): PoolEgressObservationCounts {
  const db = getDbInstance();
  const perExit = db
    .prepare(
      `SELECT COUNT(DISTINCT l.connection_id) AS n
       FROM proxy_logs l
       JOIN proxy_registry r ON l.proxy_host = r.host AND l.proxy_port = r.port
       WHERE r.id IN (SELECT proxy_id FROM proxy_assignments WHERE scope = ? AND scope_id IS ?)
         AND l.timestamp >= ? AND l.egress_ip IS NOT NULL AND l.connection_id IS NOT NULL
       GROUP BY l.egress_ip`
    )
    .all(scope, scopeId, since) as Array<{ n: number }>;
  const total = db
    .prepare(
      `SELECT COUNT(DISTINCT l.connection_id) AS n
       FROM proxy_logs l
       JOIN proxy_registry r ON l.proxy_host = r.host AND l.proxy_port = r.port
       WHERE r.id IN (SELECT proxy_id FROM proxy_assignments WHERE scope = ? AND scope_id IS ?)
         AND l.timestamp >= ? AND l.egress_ip IS NOT NULL AND l.connection_id IS NOT NULL`
    )
    .get(scope, scopeId, since) as { n: number };
  return {
    connections: total.n,
    distinctExits: perExit.length,
    maxConnectionsOnOneExit: perExit.reduce((max, row) => Math.max(max, row.n), 0),
  };
}

export function getRecentEgressIpForProxy(
  host: string,
  port: number
): { egressIp: string; at: string } | null {
  const normalizedHost = typeof host === "string" ? host.trim().replace(/^\[|\]$/g, "").toLowerCase() : "";
  if (!normalizedHost || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const db = getDbInstance();
  const since = new Date(Date.now() - EGRESS_IP_LOOKUP_WINDOW_MS).toISOString();
  const row = db
    .prepare(
      `SELECT egress_ip, timestamp FROM proxy_logs
       WHERE LOWER(TRIM(REPLACE(REPLACE(proxy_host, '[', ''), ']', ''))) = ?
         AND proxy_port = ? AND egress_ip IS NOT NULL AND timestamp >= ?
       ORDER BY timestamp DESC LIMIT 1`
    )
    .get(normalizedHost, port, since) as { egress_ip: string; timestamp: string } | undefined;
  return row ? { egressIp: row.egress_ip, at: row.timestamp } : null;
}


export type PoolEgressFailureFamily = {
  family: string;
  count: number;
};

export type PoolEgressFailureExit = {
  exit: string;
  failures: number;
  byFamily: PoolEgressFailureFamily[];
};

export type PoolEgressFailureBreakdown = {
  byExit: PoolEgressFailureExit[];
  byFamily: PoolEgressFailureFamily[];
  unattributed: number;
  attributionNote: string;
};

export const POOL_EGRESS_ATTRIBUTION_NOTE =
  "failure families are derived from persisted proxy status/error text on this schema";

function classifyPersistedProxyFailure(status: string | null, error: string | null): string | null {
  if ((status ?? "").toLowerCase() === "timeout") return "timeout";
  const text = (error ?? "").trim().toLowerCase();
  if (!text) return null;
  if (/\b429\b|rate[ _-]?limit|too many requests/.test(text)) return "rate_limited";
  if (/quota|credits? exhausted|usage limit/.test(text)) return "quota_exhausted";
  if (/\b401\b|unauthori[sz]ed|invalid token|invalid api key/.test(text)) return "unauthorized";
  if (/\b403\b|forbidden|permission denied/.test(text)) return "forbidden";
  if (/\b5\d\d\b|server error|internal error|overload|bad gateway|service unavailable/.test(text)) {
    return "server_error";
  }
  return "unknown";
}

/**
 * Per-exit failure breakdown for one proxy pool over the observation window.
 *
 * Current AgentProxy no longer persists `proxy_logs.correlation_id`, so the
 * upstream call-log join is not available. Instead, this adaptation derives a
 * stable family from the persisted proxy status/error text and keeps rows with
 * no usable error signal in the explicit `unattributed` bucket. Raw error text
 * is never returned to the dashboard.
 */
export function getPoolEgressFailureBreakdown(
  scope: string,
  scopeId: string | null,
  since: string
): PoolEgressFailureBreakdown {
  const db = getDbInstance();
  const rows = db
    .prepare(
      `SELECT l.egress_ip AS exit,
              l.status AS status,
              l.error AS error,
              COUNT(*) AS n
       FROM proxy_logs l
       JOIN proxy_registry r ON l.proxy_host = r.host AND l.proxy_port = r.port
       WHERE r.id IN (SELECT proxy_id FROM proxy_assignments WHERE scope = ? AND scope_id IS ?)
         AND l.timestamp >= ? AND l.status != 'success'
         AND l.egress_ip IS NOT NULL AND l.connection_id IS NOT NULL
       GROUP BY l.egress_ip, l.status, l.error
       ORDER BY l.egress_ip ASC`
    )
    .all(scope, scopeId, since) as Array<{
    exit: string;
    status: string | null;
    error: string | null;
    n: number;
  }>;

  const byExitMap = new Map<string, Map<string, number>>();
  const byFamilyMap = new Map<string, number>();
  let unattributed = 0;
  for (const row of rows) {
    const family = classifyPersistedProxyFailure(row.status, row.error) ?? "unattributed";
    let exitFamilies = byExitMap.get(row.exit);
    if (!exitFamilies) {
      exitFamilies = new Map<string, number>();
      byExitMap.set(row.exit, exitFamilies);
    }
    exitFamilies.set(family, (exitFamilies.get(family) ?? 0) + row.n);
    byFamilyMap.set(family, (byFamilyMap.get(family) ?? 0) + row.n);
    if (family === "unattributed") unattributed += row.n;
  }

  const sortFamilies = (entries: Array<[string, number]>): PoolEgressFailureFamily[] =>
    entries
      .map(([family, count]) => ({ family, count }))
      .sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));

  return {
    byExit: [...byExitMap.entries()].map(([exit, families]) => ({
      exit,
      failures: [...families.values()].reduce((sum, n) => sum + n, 0),
      byFamily: sortFamilies([...families.entries()]),
    })),
    byFamily: sortFamilies([...byFamilyMap.entries()]),
    unattributed,
    attributionNote: POOL_EGRESS_ATTRIBUTION_NOTE,
  };
}

/**
 * Last non-null egress IP observed for a connection within the window, or
 * null. Best-effort by design: egress_ip is only populated once the egress IP
 * has been probed (cache TTL 5 min), so a cold cache yields null and the
 * caller must fall back to today's behavior. Synchronous read (#10539 — no
 * in-memory cache to go stale). The table has no index on connection_id
 * (migration 134, YAGNI); the scan is bounded by the window via
 * idx_pl_timestamp and this helper only runs at 429 frequency.
 */
export function getRecentEgressIpForConnection(
  connectionId: string,
  since: string
): { egressIp: string; at: string } | null {
  const db = getDbInstance();
  const row = db
    .prepare(
      `SELECT egress_ip, timestamp FROM proxy_logs
       WHERE connection_id = ? AND egress_ip IS NOT NULL AND timestamp >= ?
       ORDER BY timestamp DESC LIMIT 1`
    )
    .get(connectionId, since) as { egress_ip: string; timestamp: string } | undefined;
  if (!row) return null;
  return { egressIp: row.egress_ip, at: row.timestamp };
}

function normalizeProxyHostKey(host: unknown): string {
  if (typeof host !== "string") return "";
  const trimmed = host.trim();
  if (!trimmed) return "";
  const unbracketed =
    trimmed.startsWith("[") && trimmed.endsWith("]") && trimmed.length > 2
      ? trimmed.slice(1, -1).trim()
      : trimmed;
  return unbracketed.toLowerCase();
}

/**
 * Distinct non-null egress IPs observed through a proxy endpoint since
 * `sinceIso` (up to `limit`). Invalid keys return [] instead of throwing.
 */
export function getRecentEgressIpsForProxy(
  host: string,
  port: number,
  sinceIso: string,
  limit = 3
): string[] {
  const normalizedHost = normalizeProxyHostKey(host);
  if (!normalizedHost) return [];
  if (!Number.isInteger(port) || port < 1 || port > 65535) return [];
  if (typeof sinceIso !== "string" || !sinceIso) return [];
  const capped = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 10) : 3;
  const db = getDbInstance();
  const rows = db
    .prepare(
      `SELECT DISTINCT egress_ip FROM proxy_logs
       WHERE LOWER(TRIM(REPLACE(REPLACE(proxy_host, '[', ''), ']', ''))) = ?
         AND proxy_port = ?
         AND egress_ip IS NOT NULL AND timestamp >= ?
       LIMIT ?`
    )
    .all(normalizedHost, port, sinceIso, capped) as Array<{ egress_ip: string }>;
  return rows.map((row) => row.egress_ip).filter((ip) => typeof ip === "string" && ip);
}
