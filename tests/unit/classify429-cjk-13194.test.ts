import test from "node:test";
import assert from "node:assert/strict";
import { classify429, looksLikeQuotaExhausted } from "../../src/shared/utils/classify429.ts";

const quotaBodies = [
  "已达到 5 小时的使用上限。您的限额将在 2026-09-10 19:01:19 重置。",
  "您的账户额度已用尽，请充值后重试。",
  "当前账户的免费额度已用完，请前往控制台充值。",
  "已达到今日调用上限，请明日再试。",
  "クォータに達しました。",
  "할당량을 초과했습니다.",
];

test("CJK quota exhaustion messages classify as quota_exhausted", () => {
  for (const body of quotaBodies) {
    assert.equal(looksLikeQuotaExhausted(body), true, body);
    assert.equal(classify429({ status: 429, body }), "quota_exhausted", body);
  }
});

test("Chinese transient request-frequency message remains rate_limit", () => {
  const body = "请求过于频繁，请稍后再试。";
  assert.equal(looksLikeQuotaExhausted(body), false);
  assert.equal(classify429({ status: 429, body }), "rate_limit");
});
