import test from "node:test";
import assert from "node:assert/strict";

const { classify429, looksLikeQuotaExhausted } =
  await import("../../src/shared/utils/classify429.ts");
const { buildRolling24hQuotaFallback } =
  await import("../../open-sse/services/quotaTextCooldowns.ts");
const { checkFallbackError, hasPerModelQuota } =
  await import("../../open-sse/services/accountFallback.ts");
const { RateLimitReason } = await import("../../open-sse/config/constants.ts");

const BODY =
  "You've used all the included free usage for model grok-4.6 for now. " +
  "Usage resets over a rolling 24-hour window — tokens (actual/limit): 513161/500000.";
const DAY_MS = 24 * 60 * 60 * 1000;

test("#13984: Grok rolling-24h free usage is quota exhaustion", () => {
  assert.equal(looksLikeQuotaExhausted(BODY), true);
  assert.equal(classify429({ status: 429, body: BODY }), "quota_exhausted");
});

test("#13984: rolling-24h text builds a 24h quota fallback", () => {
  assert.deepEqual(buildRolling24hQuotaFallback(BODY), {
    shouldFallback: true,
    cooldownMs: DAY_MS,
    reason: RateLimitReason.QUOTA_EXHAUSTED,
    quotaResetHintMs: DAY_MS,
  });
});

test("#13984: account fallback emits 24h QUOTA_EXHAUSTED and grok-cli remains model-scoped", () => {
  const result = checkFallbackError(429, BODY, 0, "grok-4.6", "grok-cli");
  assert.equal(result.shouldFallback, true);
  assert.equal(result.reason, RateLimitReason.QUOTA_EXHAUSTED);
  assert.equal(result.cooldownMs, DAY_MS);
  assert.equal(result.quotaResetHintMs, DAY_MS);
  assert.equal(hasPerModelQuota("grok-cli", "grok-4.6"), true);
});

test("#13984: generic Grok 429 stays a short rate limit", () => {
  assert.equal(classify429({ status: 429, body: "Too many requests. Please retry shortly." }), "rate_limit");
});
