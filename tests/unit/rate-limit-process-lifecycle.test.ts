import assert from "node:assert/strict";
import test from "node:test";

const manager = await import("../../open-sse/services/rateLimitManager.ts");

test("rate-limit watchdog does not install process signal handlers", async () => {
  const beforeInt = process.listenerCount("SIGINT");
  const beforeTerm = process.listenerCount("SIGTERM");
  try {
    manager.startRateLimitWatchdog();
    assert.equal(process.listenerCount("SIGINT"), beforeInt);
    assert.equal(process.listenerCount("SIGTERM"), beforeTerm);
    assert.equal(typeof manager.shutdownRateLimitManager, "function");
  } finally {
    await manager.__resetRateLimitManagerForTests();
  }
});

test("rate-limit manager publishes an idempotent main-lifecycle drain handle", () => {
  assert.equal(
    (globalThis as typeof globalThis & { __agentproxyShutdownRateLimit?: () => Promise<void> })
      .__agentproxyShutdownRateLimit,
    manager.shutdownRateLimitManager
  );
});
