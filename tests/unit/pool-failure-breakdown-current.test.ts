import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-pool-failure-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const proxiesDb = await import("../../src/lib/db/proxies.ts");
const proxyLogsDb = await import("../../src/lib/db/proxyLogs.ts");

const HOUR_MS = 60 * 60 * 1000;
let nextPort = 39000;

function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(resetStorage);
test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function poolMember(scope: string, scopeId: string | null) {
  nextPort++;
  const proxy = await proxiesDb.createProxy({
    name: `proxy ${nextPort}`,
    type: "http",
    host: "10.9.0.1",
    port: nextPort,
  });
  await proxiesDb.addProxyToScopePool(scope, scopeId, proxy.id);
  return { host: "10.9.0.1", port: nextPort };
}

function proxyRow(
  member: { host: string; port: number },
  status: string,
  egressIp: string | null,
  connectionId: string | null,
  error: string | null
) {
  core
    .getDbInstance()
    .prepare(
      `INSERT INTO proxy_logs
       (id, timestamp, status, proxy_type, proxy_host, proxy_port, level, connection_id, egress_ip, error)
       VALUES (?, ?, ?, 'http', ?, ?, 'provider', ?, ?, ?)`
    )
    .run(
      randomUUID(),
      new Date(Date.now() - HOUR_MS).toISOString(),
      status,
      member.host,
      member.port,
      connectionId,
      egressIp,
      error
    );
}

test("groups persisted proxy failures by exit without exposing raw error text", async () => {
  const member = await poolMember("provider", "openai");
  proxyRow(member, "error", "203.0.113.1", "c1", "HTTP 500 upstream server error: secret detail");
  proxyRow(member, "error", "203.0.113.1", "c2", "HTTP 429 rate limit exceeded");
  proxyRow(member, "timeout", "203.0.113.1", "c3", "socket timeout");
  proxyRow(member, "error", "203.0.113.2", "c4", null);
  proxyRow(member, "success", "203.0.113.1", "c5", null);
  proxyRow(member, "error", null, "c6", "HTTP 500 ignored without egress");

  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString();
  assert.deepEqual(proxyLogsDb.getPoolEgressFailureBreakdown("provider", "openai", since), {
    byExit: [
      {
        exit: "203.0.113.1",
        failures: 3,
        byFamily: [
          { family: "rate_limited", count: 1 },
          { family: "server_error", count: 1 },
          { family: "timeout", count: 1 },
        ],
      },
      {
        exit: "203.0.113.2",
        failures: 1,
        byFamily: [{ family: "unattributed", count: 1 }],
      },
    ],
    byFamily: [
      { family: "rate_limited", count: 1 },
      { family: "server_error", count: 1 },
      { family: "timeout", count: 1 },
      { family: "unattributed", count: 1 },
    ],
    unattributed: 1,
    attributionNote: "failure families are derived from persisted proxy status/error text on this schema",
  });
});

test("empty current-schema breakdown is explicit and stable", async () => {
  await poolMember("provider", "nobody");
  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString();
  assert.deepEqual(proxyLogsDb.getPoolEgressFailureBreakdown("provider", "nobody", since), {
    byExit: [],
    byFamily: [],
    unattributed: 0,
    attributionNote: "failure families are derived from persisted proxy status/error text on this schema",
  });
});
