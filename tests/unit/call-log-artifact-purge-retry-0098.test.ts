import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { useDecollidedMigrationsDir } from "./helpers/decollidedMigrationsDir.ts";

useDecollidedMigrationsDir();
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-ap0098-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_RETENTION_DAYS = process.env.CALL_LOG_RETENTION_DAYS;
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.CALL_LOG_RETENTION_DAYS = "1";

const core = await import("../../src/lib/db/core.ts");
const { CALL_LOGS_DIR, deleteCallArtifact } = await import("../../src/lib/usage/callLogArtifacts.ts");
const { deleteCallLogsBefore, rotateCallLogs } = await import("../../src/lib/usage/callLogs.ts");
const purgeLogsRoute = await import("../../src/app/api/settings/purge-logs/route.ts");
const purgeCallLogsRoute = await import("../../src/app/api/settings/purge-call-logs/route.ts");
const purgeRequestHistoryRoute = await import("../../src/app/api/settings/purge-request-history/route.ts");
const purgeUsageHistoryRoute = await import("../../src/app/api/settings/purge-usage-history/route.ts");
const compliance = await import("../../src/lib/compliance/index.ts");

function insertCallLog(id: string, timestamp: string, artifactRelpath: string | null) {
  core
    .getDbInstance()
    .prepare("INSERT INTO call_logs (id, timestamp, artifact_relpath) VALUES (?, ?, ?)")
    .run(id, timestamp, artifactRelpath);
}

function countCallLog(id: string): number {
  return (
    core.getDbInstance().prepare("SELECT COUNT(*) AS c FROM call_logs WHERE id = ?").get(id) as {
      c: number;
    }
  ).c;
}

test("deleteCallArtifact distinguishes deleted, already-missing, and filesystem-error outcomes", () => {
  assert.ok(CALL_LOGS_DIR);
  const rel = "2026-09-17/outcome.json";
  const abs = path.join(CALL_LOGS_DIR!, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "{}");

  assert.equal(deleteCallArtifact(rel).state, "deleted");
  assert.equal(deleteCallArtifact(rel).state, "missing");

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "{}");
  fs.chmodSync(path.dirname(abs), 0o500);
  try {
    const outcome = deleteCallArtifact(rel);
    assert.equal(outcome.state, "error");
    assert.match(outcome.error ?? "", /EACCES|permission/i);
    assert.equal(fs.existsSync(abs), true);
  } finally {
    fs.chmodSync(path.dirname(abs), 0o700);
  }
});

test("row-scoped purge retains the owning call_log row when artifact deletion fails", () => {
  assert.ok(CALL_LOGS_DIR);
  const old = "2026-09-01T00:00:00.000Z";
  const rel = "2026-09-01/retry-owner.json";
  const abs = path.join(CALL_LOGS_DIR!, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "{}");
  insertCallLog("retry-owner", old, rel);

  fs.chmodSync(path.dirname(abs), 0o500);
  try {
    const result = deleteCallLogsBefore("2026-09-02T00:00:00.000Z");
    assert.equal(result.deletedRows, 0);
    assert.equal(result.deletedArtifacts, 0);
    assert.equal(result.errors, 1);
    assert.equal(countCallLog("retry-owner"), 1, "failed artifact deletion must retain retry ownership");
    assert.equal(fs.existsSync(abs), true);
  } finally {
    fs.chmodSync(path.dirname(abs), 0o700);
  }

  const retry = deleteCallLogsBefore("2026-09-02T00:00:00.000Z");
  assert.equal(retry.errors, 0);
  assert.equal(retry.deletedRows, 1);
  assert.equal(retry.deletedArtifacts, 1);
  assert.equal(countCallLog("retry-owner"), 0);
  assert.equal(fs.existsSync(abs), false);
});


function resetCallLogFixture() {
  const db = core.getDbInstance();
  db.prepare("DELETE FROM call_logs").run();
  if (CALL_LOGS_DIR) {
    fs.rmSync(CALL_LOGS_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function seedUndeletableCallLog(id: string) {
  assert.ok(CALL_LOGS_DIR);
  const rel = `2020-01-01/${id}.json`;
  const abs = path.join(CALL_LOGS_DIR!, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "{}");
  insertCallLog(id, "2020-01-01T00:00:00.000Z", rel);
  fs.chmodSync(path.dirname(abs), 0o500);
  return { abs, dir: path.dirname(abs) };
}

test("database row deletion failure does not delete the owned artifact first", () => {
  resetCallLogFixture();
  assert.ok(CALL_LOGS_DIR);
  const rel = "2020-01-01/db-failure.json";
  const abs = path.join(CALL_LOGS_DIR!, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "{}");
  insertCallLog("db-failure", "2020-01-01T00:00:00.000Z", rel);
  const db = core.getDbInstance();
  db.exec(`
    CREATE TRIGGER ap0098_force_call_log_delete_failure
    BEFORE DELETE ON call_logs
    WHEN OLD.id = 'db-failure'
    BEGIN
      SELECT RAISE(ABORT, 'forced call_log delete failure');
    END;
  `);
  try {
    assert.throws(
      () => deleteCallLogsBefore("2020-01-02T00:00:00.000Z"),
      /forced call_log delete failure/
    );
    assert.equal(countCallLog("db-failure"), 1);
    assert.equal(fs.existsSync(abs), true, "DB failure must occur before artifact deletion");
  } finally {
    db.exec("DROP TRIGGER IF EXISTS ap0098_force_call_log_delete_failure");
  }
  deleteCallLogsBefore("2020-01-02T00:00:00.000Z");
  resetCallLogFixture();
});

test("all user-triggered purge routes surface artifact deletion failure and retain retry ownership", async () => {
  const cases: Array<{ name: string; invoke: () => Promise<Response> }> = [
    {
      name: "purge-logs",
      invoke: () => purgeLogsRoute.POST(new Request("http://localhost/api/settings/purge-logs", { method: "POST" })),
    },
    {
      name: "purge-call-logs",
      invoke: () => purgeCallLogsRoute.POST(new Request("http://localhost/api/settings/purge-call-logs", { method: "POST" })),
    },
    {
      name: "purge-request-history",
      invoke: () => purgeRequestHistoryRoute.POST(new Request("http://localhost/api/settings/purge-request-history", { method: "POST" })),
    },
    {
      name: "purge-usage-history",
      invoke: () =>
        purgeUsageHistoryRoute.POST(
          new Request("http://localhost/api/settings/purge-usage-history", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ period: "1d" }),
          })
        ),
    },
  ];

  for (const entry of cases) {
    resetCallLogFixture();
    const id = `route-${entry.name}`;
    const fixture = seedUndeletableCallLog(id);
    try {
      const response = await entry.invoke();
      const body = await response.json();
      assert.equal(response.status, 500, `${entry.name} must surface partial cleanup failure`);
      assert.ok(Number(body.errors) > 0, `${entry.name} must report artifact errors`);
      assert.equal(countCallLog(id), 1, `${entry.name} must retain artifact ownership for retry`);
      assert.equal(fs.existsSync(fixture.abs), true);
    } finally {
      fs.chmodSync(fixture.dir, 0o700);
    }
  }
  resetCallLogFixture();
});

test("scheduled rotation emits an observable error and retains a row when artifact deletion fails", () => {
  resetCallLogFixture();
  const fixture = seedUndeletableCallLog("rotation-retry");
  const originalError = console.error;
  const errors: string[] = [];
  console.error = (...args: unknown[]) => errors.push(args.map(String).join(" "));
  try {
    rotateCallLogs();
    assert.equal(countCallLog("rotation-retry"), 1);
    assert.equal(fs.existsSync(fixture.abs), true);
    assert.ok(errors.some((line) => line.includes("call-log artifact deletion failed")));
  } finally {
    console.error = originalError;
    fs.chmodSync(fixture.dir, 0o700);
  }
  resetCallLogFixture();
});

test("compliance cleanup records an error audit and retains retry ownership on artifact failure", async () => {
  resetCallLogFixture();
  compliance.initAuditLog();
  const fixture = seedUndeletableCallLog("compliance-retry");
  try {
    await compliance.cleanupExpiredLogs();
    assert.equal(countCallLog("compliance-retry"), 1);
    assert.equal(fs.existsSync(fixture.abs), true);
    const cleanupEntry = compliance
      .getAuditLog()
      .find((entry) => entry.action === "compliance.cleanup");
    assert.ok(cleanupEntry);
    assert.equal(cleanupEntry.status, "error");
    const details = cleanupEntry.details as { callLogCleanupErrors?: number } | undefined;
    assert.ok((details?.callLogCleanupErrors ?? 0) > 0);
  } finally {
    fs.chmodSync(fixture.dir, 0o700);
  }
  resetCallLogFixture();
});

test.after(() => {
  core.resetDbInstance();
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  if (ORIGINAL_RETENTION_DAYS === undefined) delete process.env.CALL_LOG_RETENTION_DAYS;
  else process.env.CALL_LOG_RETENTION_DAYS = ORIGINAL_RETENTION_DAYS;
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
