import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-log-export-0099-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const callLogs = await import("../../src/lib/usage/callLogs.ts");
const proxyLogs = await import("../../src/lib/db/proxyLogs.ts");
const legacyExportRoute = await import("../../src/app/api/logs/export/route.ts");

const FIXTURE_ROWS = 300;
const EXPECTED_MAX_BATCH = 128;

type PreparedStatement = ReturnType<ReturnType<typeof core.getDbInstance>["prepare"]>;

function seedCallLogs(count: number) {
  const db = core.getDbInstance();
  const insert = db.prepare(
    `INSERT INTO call_logs (id, timestamp, method, path, status, provider, detail_state)
     VALUES (?, ?, 'POST', '/v1/responses', 200, 'openai', 'none')`
  );
  const baseMs = Date.now() - 10 * 60 * 1000;
  for (let i = 0; i < count; i += 1) {
    insert.run(`call-${i}`, new Date(baseMs + i * 1000).toISOString());
  }
}

function seedProxyLogs(count: number) {
  const db = core.getDbInstance();
  const insert = db.prepare(
    `INSERT INTO proxy_logs (id, timestamp, provider, status, proxy_type, public_ip)
     VALUES (?, ?, 'openai', 'ok', 'http', '203.0.113.10')`
  );
  const baseMs = Date.now() - 10 * 60 * 1000;
  for (let i = 0; i < count; i += 1) {
    insert.run(`proxy-${i}`, new Date(baseMs + i * 1000).toISOString());
  }
}

async function observeExport(type: "call-logs" | "proxy-logs") {
  const db = core.getDbInstance();
  const originalPrepare = db.prepare;
  const originalStringify = JSON.stringify;
  let maxAllRows = 0;
  let maxEnvelopeRows = 0;

  db.prepare = ((sql: string) => {
    const statement = originalPrepare.call(db, sql) as PreparedStatement;
    if (!/\b(?:call_logs|proxy_logs)\b/i.test(sql) || typeof statement.all !== "function") {
      return statement;
    }

    const originalAll = statement.all.bind(statement);
    statement.all = ((...args: unknown[]) => {
      const rows = originalAll(...args);
      if (Array.isArray(rows)) maxAllRows = Math.max(maxAllRows, rows.length);
      return rows;
    }) as typeof statement.all;
    return statement;
  }) as typeof db.prepare;

  JSON.stringify = ((value: unknown, ...args: unknown[]) => {
    if (value && typeof value === "object" && Array.isArray((value as { logs?: unknown[] }).logs)) {
      maxEnvelopeRows = Math.max(maxEnvelopeRows, (value as { logs: unknown[] }).logs.length);
    }
    return Reflect.apply(originalStringify, JSON, [value, ...args]) as string | undefined;
  }) as typeof JSON.stringify;

  try {
    const response = await legacyExportRoute.GET(
      new Request(`http://127.0.0.1/api/logs/export?hours=168&type=${type}`)
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { logs: unknown[]; count: number; type: string };
    assert.equal(body.count, FIXTURE_ROWS);
    assert.equal(body.logs.length, FIXTURE_ROWS);
    assert.equal(body.type, type);
    return { maxAllRows, maxEnvelopeRows };
  } finally {
    db.prepare = originalPrepare;
    JSON.stringify = originalStringify;
  }
}

test.beforeEach(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("AP-ISS-0099 call-log export bounds SQLite batches and avoids full-envelope buffering", async () => {
  seedCallLogs(FIXTURE_ROWS);
  const observed = await observeExport("call-logs");

  assert.ok(
    observed.maxAllRows <= EXPECTED_MAX_BATCH,
    `largest call_logs SQLite batch must be <= ${EXPECTED_MAX_BATCH}, got ${observed.maxAllRows}`
  );
  assert.equal(
    observed.maxEnvelopeRows,
    0,
    `route must not JSON.stringify a fully materialized logs envelope, saw ${observed.maxEnvelopeRows} rows`
  );
});

test("AP-ISS-0099 proxy-log export bounds SQLite batches and avoids full-envelope buffering", async () => {
  seedProxyLogs(FIXTURE_ROWS);
  const observed = await observeExport("proxy-logs");

  assert.ok(
    observed.maxAllRows <= EXPECTED_MAX_BATCH,
    `largest proxy_logs SQLite batch must be <= ${EXPECTED_MAX_BATCH}, got ${observed.maxAllRows}`
  );
  assert.equal(
    observed.maxEnvelopeRows,
    0,
    `route must not JSON.stringify a fully materialized logs envelope, saw ${observed.maxEnvelopeRows} rows`
  );
});

test("AP-ISS-0099 small call-log export preserves the legacy JSON envelope and filename", async () => {
  seedCallLogs(2);
  const expectedLogs = [
    await callLogs.getCallLogById("call-1"),
    await callLogs.getCallLogById("call-0"),
  ];
  const response = await legacyExportRoute.GET(
    new Request("http://127.0.0.1/api/logs/export?hours=168&type=call-logs")
  );
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.match(
    response.headers.get("content-disposition") ?? "",
    /^attachment; filename="agentproxy-call_logs-168h-\d{4}-\d{2}-\d{2}\.json"$/
  );
  assert.equal(
    text,
    JSON.stringify({ logs: expectedLogs, count: 2, hours: 168, type: "call-logs" }, null, 2)
  );
});

test("AP-ISS-0099 request-log alias keeps call_logs filename and request-logs type", async () => {
  seedCallLogs(1);
  const response = await legacyExportRoute.GET(
    new Request("http://127.0.0.1/api/logs/export?hours=168&type=request-logs")
  );
  const body = (await response.json()) as { logs: unknown[]; count: number; type: string };

  assert.equal(response.status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.logs.length, 1);
  assert.equal(body.type, "request-logs");
  assert.match(
    response.headers.get("content-disposition") ?? "",
    /^attachment; filename="agentproxy-call_logs-168h-\d{4}-\d{2}-\d{2}\.json"$/
  );
});

test("AP-ISS-0099 proxy export preserves descending rows and historical public_ip field", async () => {
  seedProxyLogs(3);
  const since = new Date(Date.now() - 168 * 3600 * 1000).toISOString();
  const expectedLogs = proxyLogs.exportProxyLogsSince(since);
  const response = await legacyExportRoute.GET(
    new Request("http://127.0.0.1/api/logs/export?hours=168&type=proxy-logs")
  );
  const text = await response.text();
  const body = JSON.parse(text) as {
    logs: Array<{ id: string; timestamp: string; public_ip?: string; clientIp?: string }>;
    count: number;
    hours: number;
    type: string;
  };

  assert.equal(response.status, 200);
  assert.equal(
    text,
    JSON.stringify({ logs: expectedLogs, count: 3, hours: 168, type: "proxy-logs" }, null, 2)
  );
  assert.equal(body.count, 3);
  assert.equal(body.logs[0].id, "proxy-2");
  assert.equal(body.logs[0].public_ip, "203.0.113.10");
  assert.equal("clientIp" in body.logs[0], false);
});

test("AP-ISS-0099 streamed call export preserves missing-artifact detail behavior", async () => {
  const db = core.getDbInstance();
  db.prepare(
    `INSERT INTO call_logs
      (id, timestamp, method, path, status, provider, detail_state, artifact_relpath, has_request_body)
     VALUES (?, ?, 'POST', '/v1/responses', 200, 'openai', 'ready', ?, 1)`
  ).run("missing-artifact", new Date().toISOString(), "2026-09-17/missing.json");

  const response = await legacyExportRoute.GET(
    new Request("http://127.0.0.1/api/logs/export?hours=168&type=call-logs")
  );
  const body = (await response.json()) as {
    logs: Array<{ id: string; detailState: string; requestBody: unknown }>;
    count: number;
  };

  assert.equal(response.status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.logs[0].id, "missing-artifact");
  assert.equal(body.logs[0].detailState, "missing");
  assert.equal(body.logs[0].requestBody, null);

  const stored = db
    .prepare("SELECT artifact_relpath, detail_state FROM call_logs WHERE id = ?")
    .get("missing-artifact") as { artifact_relpath: string | null; detail_state: string };
  assert.equal(stored.artifact_relpath, null);
  assert.equal(stored.detail_state, "missing");
});

test("AP-ISS-0099 empty call-log export preserves the legacy JSON envelope", async () => {
  const response = await legacyExportRoute.GET(
    new Request("http://127.0.0.1/api/logs/export?hours=168&type=call-logs")
  );
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.equal(
    text,
    JSON.stringify({ logs: [], count: 0, hours: 168, type: "call-logs" }, null, 2)
  );
});

test("AP-ISS-0099 management auth still rejects an unauthenticated request before export", async () => {
  const previousPassword = process.env.INITIAL_PASSWORD;
  process.env.INITIAL_PASSWORD = "ap99-management-test-password";
  try {
    seedCallLogs(1);
    const response = await legacyExportRoute.GET(
      new Request("http://127.0.0.1/api/logs/export?hours=168&type=call-logs")
    );
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error?: { message?: string } };
    assert.equal(body.error?.message, "Authentication required");
  } finally {
    if (previousPassword === undefined) delete process.env.INITIAL_PASSWORD;
    else process.env.INITIAL_PASSWORD = previousPassword;
  }
});
