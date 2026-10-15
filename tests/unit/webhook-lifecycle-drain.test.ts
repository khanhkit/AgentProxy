import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-webhook-drain-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";

const core = await import("../..//src/lib/db/core.ts");
const { createWebhook } = await import("../../src/lib/db/webhooks.ts");
const dispatcher = await import("../../src/lib/webhookDispatcher.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("notifyWebhookEvent stays non-blocking while shutdown drain awaits pending delivery", async () => {
  dispatcher.__resetWebhookLifecycleForTests();
  createWebhook({
    url: "https://example.com/agentproxy-hook",
    events: ["request.completed"],
    kind: "custom",
  });

  const originalFetch = global.fetch;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  global.fetch = (async () => {
    await gate;
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    const returned = dispatcher.notifyWebhookEvent("request.completed", { requestId: "req-drain" });
    assert.equal(returned, undefined, "hot-path notification must remain fire-and-forget");
    assert.equal(dispatcher.getWebhookDeliveryStats().pending, 1);
    assert.throws(
      () => dispatcher.__resetWebhookLifecycleForTests(),
      /pending webhook deliver/i,
      "test reset must not detach pending deliveries from lifecycle tracking"
    );

    let drained = false;
    const drain = dispatcher.drainPendingWebhookDeliveries().then((stats) => {
      drained = true;
      return stats;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(drained, false, "shutdown drain must wait for the pending webhook delivery");

    release();
    const stats = await drain;
    assert.equal(stats.pending, 0);
    assert.equal(stats.started, 1);
    assert.equal(stats.completed, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test("webhook drain closes notification admission before it reports empty", async () => {
  dispatcher.__resetWebhookLifecycleForTests();

  const before = await dispatcher.drainPendingWebhookDeliveries();
  assert.equal(before.pending, 0);
  assert.equal(before.started, 0);

  dispatcher.notifyWebhookEvent("request.completed", { requestId: "req-after-drain" });
  await new Promise((resolve) => setImmediate(resolve));

  const after = dispatcher.getWebhookDeliveryStats();
  assert.equal(after.started, 0, "notifications arriving after drain begins must not be admitted");
  assert.equal(after.pending, 0);
});

test("webhook lifecycle stats count fulfilled dispatches containing failed deliveries", async () => {
  dispatcher.__resetWebhookLifecycleForTests();
  const originalFetch = global.fetch;
  global.fetch = (async () => new Response(null, { status: 400 })) as typeof fetch;
  try {
    dispatcher.notifyWebhookEvent("request.completed", { requestId: "req-failed-delivery" });
    const stats = await dispatcher.drainPendingWebhookDeliveries();
    assert.equal(stats.pending, 0);
    assert.equal(stats.started, 1);
    assert.equal(stats.completed, 1);
    assert.ok(stats.failed >= 1, "a 4xx delivery failure must be reflected in lifecycle stats");
  } finally {
    global.fetch = originalFetch;
  }
});
