import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const audit = await import("../../open-sse/mcp-server/audit.ts");

test("MCP audit retries a transient SQLite open failure after bounded cooldown", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ap0193-mcp-audit-"));
  writeFileSync(join(dir, "storage.sqlite"), "");
  const oldDir = process.env.DATA_DIR;
  const originalNow = Date.now;
  let now = 1_000_000;
  let attempts = 0;
  try {
    process.env.DATA_DIR = dir;
    Date.now = () => now;
    globalThis.__agentproxyMcpAuditDb = undefined;
    audit.__setBetterSqliteLoaderForTests(() => {
      attempts++;
      if (attempts === 1) throw new Error("SQLITE_BUSY temporary lock");
      return class FakeDb {
        open = true;
        prepare() {
          return { get: () => ({ total: 1 }), all: () => [], run: () => undefined };
        }
        pragma() {}
        close() {}
      };
    });
    assert.equal((await audit.queryAuditEntries()).total, 0);
    assert.equal(attempts, 1);
    now += 1_000;
    assert.equal((await audit.queryAuditEntries()).total, 0);
    assert.equal(attempts, 1, "avoid hot-loop retry on every request");
    now += 31_000;
    assert.equal((await audit.queryAuditEntries()).total, 1);
    assert.equal(attempts, 2, "transient failure must not disable auditing permanently");
  } finally {
    audit.closeAuditDb();
    globalThis.__agentproxyMcpAuditDb = undefined;
    audit.__setBetterSqliteLoaderForTests(null);
    Date.now = originalNow;
    if (oldDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = oldDir;
    rmSync(dir, { recursive: true, force: true });
  }
});
