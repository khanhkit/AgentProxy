-- 186_conversation_turn_nodes_last_seen_index.sql
-- Speed up retention cleanup by indexing the timestamp predicate used by the
-- conversation-turn lifecycle sweep.
CREATE INDEX IF NOT EXISTS idx_turn_nodes_last_seen
  ON conversation_turn_nodes(last_seen_at);
