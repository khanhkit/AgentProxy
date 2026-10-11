import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const { createNodeSqliteAdapter } = await import("../../src/lib/db/adapters/nodeSqliteAdapter.ts");

const SIGNALS = ["beforeExit", "SIGINT", "SIGTERM"] as const;
const PROCESS_EMIT_BEFORE_ADAPTERS = process.emit;

function counts(): Record<string, number> {
  return Object.fromEntries(SIGNALS.map((s) => [s, process.listenerCount(s)]));
}

function delta(before: Record<string, number>, after: Record<string, number>) {
  return Object.fromEntries(SIGNALS.map((s) => [s, after[s] - before[s]]));
}

test("closing a node:sqlite adapter releases its process listeners (#13108)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agentproxy-dbleak-"));
  const before = counts();

  try {
    // Short-lived adapters are a real pattern: POST /api/db-backups/import
    // opens one per request purely to validate the uploaded file.
    const N = 12;
    for (let i = 0; i < N; i++) {
      const adapter = await createNodeSqliteAdapter(join(dir, `probe-${i}.sqlite`));
      adapter.close();
    }

    const leaked = delta(before, counts());
    for (const signal of SIGNALS) {
      assert.equal(
        leaked[signal],
        0,
        `${N} open+close cycles retained ${leaked[signal]} "${signal}" listener(s) on process`
      );
    }
    assert.equal(
      process.emit,
      PROCESS_EMIT_BEFORE_ADAPTERS,
      "node:sqlite adapter create/close must not replace the process-global emit function"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an open node:sqlite adapter keeps only local beforeExit ownership (#13108)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agentproxy-dbleak-open-"));
  const before = counts();
  const emitBefore = process.emit;
  let adapter: Awaited<ReturnType<typeof createNodeSqliteAdapter>> | null = null;

  try {
    adapter = await createNodeSqliteAdapter(join(dir, "open.sqlite"));

    const armed = delta(before, counts());
    assert.equal(
      armed.beforeExit,
      1,
      "open adapter may retain one local beforeExit checkpoint hook"
    );
    assert.equal(armed.SIGINT, 0, "adapter leaf must not own SIGINT");
    assert.equal(armed.SIGTERM, 0, "adapter leaf must not own SIGTERM");
    assert.equal(process.emit, emitBefore, "adapter leaf must not replace process.emit");
  } finally {
    adapter?.close();
    assert.equal(process.emit, emitBefore, "closing the adapter must leave process.emit unchanged");
    rmSync(dir, { recursive: true, force: true });
  }
});
