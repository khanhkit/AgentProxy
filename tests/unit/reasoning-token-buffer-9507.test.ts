/**
 * #9507 — client max_tokens must NEVER be rewritten upward by the
 * reasoning-token buffer. Core contract from #1761: AgentProxy must not
 * silently enlarge a Claude Max user's per-turn cost.
 *
 * On claude-opus-5 (registry maxOutputTokens = 128000), a client sending
 * max_tokens: 64000 got rewritten to 96000 (Math.ceil(64000 * 1.5)) because
 * 96000 < 128000 so the "fits in cap" guard did NOT rescue it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-9507-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const { resolveReasoningBufferedMaxTokens, REASONING_MIN_BUDGET_ENV } =
  await import("../../open-sse/services/reasoningTokenBuffer.ts");

test.afterEach(() => {
  delete process.env[REASONING_MIN_BUDGET_ENV];
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("#9507 reasoning buffer does NOT enlarge a Claude opus-5 client budget upward", () => {
  const result = resolveReasoningBufferedMaxTokens("anthropic/claude-opus-5", 64000);
  assert.equal(
    result,
    64000,
    `client max_tokens=64000 must be forwarded verbatim, got ${result} (x1.5 upward rewrite)`
  );
});

test("#9507 reasoning buffer does NOT enlarge a Claude sonnet-5 client budget upward", () => {
  const client = 32000;
  const result = resolveReasoningBufferedMaxTokens("anthropic/claude-sonnet-5", client);
  assert.ok(
    result === null || result <= client,
    `client max_tokens=${client} must not be enlarged, got ${result}`
  );
});

test("AP-ISS-0124 reasoning minimum budget is opt-in", () => {
  process.env[REASONING_MIN_BUDGET_ENV] = "96000";
  assert.equal(resolveReasoningBufferedMaxTokens("anthropic/claude-opus-5", 64000), 96000);
});

test("AP-ISS-0124 tiny reasoning probes stay verbatim even with a floor", () => {
  process.env[REASONING_MIN_BUDGET_ENV] = "96000";
  assert.equal(resolveReasoningBufferedMaxTokens("anthropic/claude-opus-5", 1), 1);
});

test("AP-ISS-0124 reasoning floor never exceeds the model output cap", () => {
  process.env[REASONING_MIN_BUDGET_ENV] = "200000";
  assert.equal(resolveReasoningBufferedMaxTokens("anthropic/claude-opus-5", 64000), 128000);
});

test("AP-ISS-0124 invalid reasoning minimum budget is ignored", () => {
  process.env[REASONING_MIN_BUDGET_ENV] = "not-a-number";
  assert.equal(resolveReasoningBufferedMaxTokens("anthropic/claude-opus-5", 64000), 64000);
});
