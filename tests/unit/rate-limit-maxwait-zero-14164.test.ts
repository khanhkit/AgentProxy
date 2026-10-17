import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-maxwait-zero-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const resilienceSettings = await import("../../src/lib/resilience/settings.ts");
const rateLimitManager = await import("../../open-sse/services/rateLimitManager.ts");
const { capSettingsWithinBudget } =
  await import("../../open-sse/services/rateLimitManager/requestCapPolicy.ts");

test.afterEach(async () => {
  await rateLimitManager.__resetRateLimitManagerForTests();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("#14164 maxWaitMs=0 disables the queue-wait deadline instead of timing out immediately", async () => {
  await rateLimitManager.applyRequestQueueSettings({
    ...resilienceSettings.DEFAULT_RESILIENCE_SETTINGS.requestQueue,
    autoEnableApiKeyProviders: false,
    concurrentRequests: 1,
    requestsPerMinute: 100000,
    minTimeBetweenRequestsMs: 0,
    maxWaitMs: 0,
    executionMaxWaitMs: 5000,
  });
  rateLimitManager.enableRateLimitProtection("conn-maxwait-zero");

  const result = await rateLimitManager.withRateLimit(
    "openai",
    "conn-maxwait-zero",
    "gpt-4o",
    async () => "ok"
  );

  assert.equal(result, "ok");
});

test("AP-ISS-0196: unlimited queue wait accepts a valid learned request cap", () => {
  const warnings: string[] = [];
  const settings = capSettingsWithinBudget({
    provider: "openai",
    connectionId: "conn-unlimited-cap",
    cap: { requests: 5, windowMs: 60_000 },
    source: "learned",
    globalMinTimeMs: 0,
    queueBudgetMs: 0,
    warn: (message) => warnings.push(message),
  });

  assert.ok(settings, "maxWaitMs=0 means unlimited queue wait, not a zero-millisecond budget");
  assert.equal(settings.minTime, 12_000);
  assert.deepEqual(warnings, []);
});

test("AP-ISS-0196 review: negative queue wait also disables the learned-cap budget", () => {
  const warnings: string[] = [];
  const settings = capSettingsWithinBudget({
    provider: "openai",
    connectionId: "conn-negative-unlimited-cap",
    cap: { requests: 5, windowMs: 60_000 },
    source: "learned",
    globalMinTimeMs: 0,
    queueBudgetMs: -1,
    warn: (message) => warnings.push(message),
  });

  assert.ok(settings, "non-positive maxWaitMs disables the queue wait deadline");
  assert.equal(settings.minTime, 12_000);
  assert.deepEqual(warnings, []);
});
