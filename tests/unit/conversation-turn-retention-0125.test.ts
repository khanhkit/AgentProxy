import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

test("TC-OMNIDB-TURN-011A: migration 186 indexes conversation turn last_seen_at", () => {
  const sql = read("src/lib/db/migrations/186_conversation_turn_nodes_last_seen_index.sql");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE conversation_turn_nodes (id TEXT PRIMARY KEY, last_seen_at TEXT NOT NULL)");
    db.exec(sql);
    const row = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_turn_nodes_last_seen'"
    ).get() as { sql?: string } | undefined;
    assert.match(String(row?.sql ?? ""), /conversation_turn_nodes\s*\(last_seen_at\)/i);
  } finally {
    db.close();
  }
});

test("TC-OMNIDB-TURN-011B: retention settings expose an independent turn-node window", () => {
  const types = read("src/types/databaseSettings.ts");
  const settings = read("src/lib/db/databaseSettings.ts");
  assert.match(types, /conversationTurnNodes:\s*number/);
  assert.match(types, /conversationTurnNodes:\s*30/);
  assert.match(settings, /conversationTurnNodes:\s*\["conversationTurnNodes"\]/);
});

test("TC-OMNIDB-TURN-012A: cleanup lifecycle removes old turn nodes and orphan roots", () => {
  const cleanup = read("src/lib/db/cleanup.ts");
  assert.match(cleanup, /export async function cleanupConversationTurnNodes/);
  assert.match(cleanup, /retention\.conversationTurnNodes/);
  assert.match(cleanup, /conversation_turn_nodes/);
  assert.match(cleanup, /export async function cleanupAgenticConversations/);
  assert.match(cleanup, /agentic_conversations/);
});

test("TC-OMNIDB-TURN-012B: auto-cleanup schedules both conversation lifecycle steps", () => {
  const cleanup = read("src/lib/db/cleanup.ts");
  assert.match(cleanup, /conversationTurnNodes:\s*await cleanupConversationTurnNodes\(\)/);
  assert.match(cleanup, /agenticConversations:\s*await cleanupAgenticConversations\(\)/);
});
