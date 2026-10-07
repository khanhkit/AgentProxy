import test from "node:test";
import assert from "node:assert/strict";

import { normalizeRequestQueueSettings } from "../../src/lib/resilience/settings/normalize.ts";
import { requestQueueSettingsSchema } from "../../src/shared/validation/schemas/settings.ts";

const fallback = {
  autoEnableApiKeyProviders: false,
  requestsPerMinute: 60,
  minTimeBetweenRequestsMs: 0,
  concurrentRequests: 2,
  globalConcurrentRequests: 0,
  maxWaitMs: 5000,
  executionMaxWaitMs: 5000,
  maxQueueDepth: 100,
};

test("maxWaitMs=0 survives normalization as the disable sentinel", () => {
  const out = normalizeRequestQueueSettings(
    { maxWaitMs: 0, executionMaxWaitMs: 0 },
    fallback
  );
  assert.equal(out.maxWaitMs, 0);
  assert.equal(out.executionMaxWaitMs, 1);
});

test("requestQueueSettingsSchema accepts maxWaitMs=0 but rejects executionMaxWaitMs=0", () => {
  assert.equal(requestQueueSettingsSchema.safeParse({ maxWaitMs: 0 }).success, true);
  assert.equal(requestQueueSettingsSchema.safeParse({ executionMaxWaitMs: 0 }).success, false);
});
