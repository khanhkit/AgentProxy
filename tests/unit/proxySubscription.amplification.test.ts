import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-sub-amplification-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const subscriptions = await import("../../src/lib/proxySubscription/index.ts");

function resetStorage(): void {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

function insertSubscription(id: string, url: string): void {
  const db = core.getDbInstance();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO proxy_subscriptions
      (id, name, url, enabled, mode, rule_providers, update_interval_minutes, status, created_at, updated_at)
     VALUES (?, ?, ?, 0, 'global', NULL, 60, 'empty', ?, ?)`
  ).run(id, `sub-${id}`, url, now, now);
}

test.beforeEach(() => {
  resetStorage();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("oversized subscription response is rejected after one fetch attempt", async () => {
  insertSubscription("oversized", "http://127.0.0.1:65530/list");
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("x".repeat(2 * 1024 * 1024 + 1), {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }) as typeof fetch;

  try {
    const result = await subscriptions.syncSubscription("oversized");
    assert.equal(result.status, "error");
    assert.match(result.error ?? "", /Subscription response exceeds 2097152 bytes/);
    assert.equal(fetchCalls, 1, "a deterministic size-limit failure must not be retried");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("concurrent refreshes for one subscription share a single in-flight fetch", async () => {
  insertSubscription("single-flight", "http://127.0.0.1:65530/list");
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  let releaseFetch!: (response: Response) => void;
  const pendingResponse = new Promise<Response>((resolve) => {
    releaseFetch = resolve;
  });
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return pendingResponse;
  }) as typeof fetch;

  try {
    const first = subscriptions.syncSubscription("single-flight");
    const second = subscriptions.syncSubscription("single-flight");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fetchCalls, 1, "only one upstream fetch may be active for a subscription id");

    releaseFetch(
      new Response(
        "proxies:\n  - name: bounded-node\n    type: http\n    server: 10.0.0.8\n    port: 8080\n",
        { status: 200, headers: { "content-type": "text/plain" } }
      )
    );

    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.status, "ok");
    assert.equal(b.status, "ok");
    assert.equal(fetchCalls, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
