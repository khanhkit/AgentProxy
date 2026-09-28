import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

test("TC-OMNIDB-FTS-005A: migration 178 recreates memory update trigger conditionally", () => {
  const sql = read("src/lib/db/migrations/178_memory_fts_au_conditional.sql");
  assert.match(
    sql,
    /WHEN old\.content IS DISTINCT FROM new\.content OR old\.key IS DISTINCT FROM new\.key/
  );
  assert.match(sql, /VALUES\('optimize'\)/);

  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        memory_id INTEGER UNIQUE,
        content TEXT NOT NULL,
        key TEXT,
        access_count INTEGER DEFAULT 0,
        last_accessed_at TEXT
      );
      CREATE VIRTUAL TABLE memory_fts USING fts5(content, key, content='memories');
      CREATE TRIGGER memory_fts_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memory_fts(rowid, content, key)
          VALUES (new.memory_id, new.content, new.key);
      END;
      CREATE TRIGGER memory_fts_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content, key)
          VALUES('delete', old.memory_id, old.content, old.key);
      END;
      CREATE TRIGGER memory_fts_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content, key)
          VALUES('delete', old.memory_id, old.content, old.key);
        INSERT INTO memory_fts(rowid, content, key)
          VALUES (new.memory_id, new.content, new.key);
      END;
    `);
    db.exec(sql);
    const row = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='memory_fts_au'")
      .get() as { sql?: string } | undefined;
    assert.match(String(row?.sql ?? ""), /WHEN old\.content IS DISTINCT FROM new\.content/i);
  } finally {
    db.close();
  }
});

test("TC-OMNIDB-FTS-005B: access-only updates do not grow FTS data rows", () => {
  const sql = read("src/lib/db/migrations/178_memory_fts_au_conditional.sql");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        memory_id INTEGER UNIQUE,
        content TEXT NOT NULL,
        key TEXT,
        access_count INTEGER DEFAULT 0,
        last_accessed_at TEXT
      );
      CREATE VIRTUAL TABLE memory_fts USING fts5(content, key, content='memories');
      CREATE TRIGGER memory_fts_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memory_fts(rowid, content, key)
          VALUES (new.memory_id, new.content, new.key);
      END;
      CREATE TRIGGER memory_fts_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content, key)
          VALUES('delete', old.memory_id, old.content, old.key);
      END;
      CREATE TRIGGER memory_fts_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, content, key)
          VALUES('delete', old.memory_id, old.content, old.key);
        INSERT INTO memory_fts(rowid, content, key)
          VALUES (new.memory_id, new.content, new.key);
      END;
      INSERT INTO memories (id, memory_id, content, key) VALUES ('m1', 1, 'alpha', 'k');
    `);
    db.exec(sql);
    const countRows = () =>
      Number((db.prepare("SELECT count(*) AS n FROM memory_fts_data").get() as { n: number }).n);
    const baseline = countRows();
    const update = db.prepare(
      "UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?"
    );
    for (let i = 0; i < 25; i++) update.run(new Date().toISOString(), "m1");
    assert.equal(countRows(), baseline);
    db.prepare("UPDATE memories SET content = ? WHERE id = ?").run("beta", "m1");
    const fts = db.prepare("SELECT content FROM memory_fts WHERE rowid = 1").get() as
      | { content: string }
      | undefined;
    assert.equal(fts?.content, "beta");
  } finally {
    db.close();
  }
});

test("TC-OMNIDB-FTS-006: migration 178 is optional when FTS5 is unavailable", () => {
  const constants = read("src/lib/db/migrationRunner/constants.ts");
  assert.match(constants, /OPTIONAL_FTS5_MIGRATION_VERSIONS = new Set\(\[[^\]]*"178"/s);
});

test("TC-OMNIDB-FTS-007: memory retention cleanup optimizes FTS after deletes", () => {
  const cleanup = read("src/lib/db/cleanup.ts");
  assert.match(
    cleanup,
    /cleanupMemoryEntries[\s\S]{0,1800}?result\.deleted > 0[\s\S]{0,700}?memory_fts\(memory_fts\)[\s\S]{0,120}?optimize/
  );
});
