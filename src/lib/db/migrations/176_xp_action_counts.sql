-- Migration 176: Durable per-key/per-action counters for gamification (#12546)
--
-- getActionCount() and checkActionCountBadges() used to count rows directly in
-- xp_audit_log, which cleanupXpAuditLog() prunes by retention.xpAuditLog.
-- Keep a durable running total per (api_key_id, action) that retention never touches.

CREATE TABLE IF NOT EXISTS xp_action_counts (
  api_key_id TEXT NOT NULL,
  action TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (api_key_id, action)
) WITHOUT ROWID;

INSERT OR IGNORE INTO xp_action_counts (api_key_id, action, count, updated_at)
SELECT
  api_key_id,
  action,
  SUM(COALESCE(CAST(json_extract(metadata, '$.amount') AS INTEGER), 1)) AS count,
  datetime('now')
FROM xp_audit_log
GROUP BY api_key_id, action;
