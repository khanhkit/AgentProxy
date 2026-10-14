-- Migration 194: make completed-request cost recording idempotent.
-- request_id is optional, so legacy/unidentified rows remain append-only. When it is
-- present, one API key may account for that request only once across completion-hook retries.
DELETE FROM request_cost_ledger
WHERE request_id IS NOT NULL
  AND TRIM(request_id) <> ''
  AND id NOT IN (
    SELECT MIN(id)
    FROM request_cost_ledger
    WHERE request_id IS NOT NULL AND TRIM(request_id) <> ''
    GROUP BY api_key_id, request_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_rcl_api_key_request_id_unique
  ON request_cost_ledger(api_key_id, request_id)
  WHERE request_id IS NOT NULL AND TRIM(request_id) <> '';
