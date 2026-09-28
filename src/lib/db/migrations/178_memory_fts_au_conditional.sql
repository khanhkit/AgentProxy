-- Prevent access-only memory updates from rewriting the external-content FTS5 row.
DROP TRIGGER IF EXISTS memory_fts_au;

CREATE TRIGGER IF NOT EXISTS memory_fts_au AFTER UPDATE ON memories
WHEN old.content IS DISTINCT FROM new.content OR old.key IS DISTINCT FROM new.key
BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, key)
    VALUES('delete', old.memory_id, old.content, old.key);
  INSERT INTO memory_fts(rowid, content, key)
    VALUES (new.memory_id, new.content, new.key);
END;

-- Reclaim tombstoned FTS5 segments accumulated before the conditional trigger.
INSERT INTO memory_fts(memory_fts) VALUES('optimize');
