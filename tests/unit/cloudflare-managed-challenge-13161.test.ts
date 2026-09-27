import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyProviderError,
  isCloudflareChallengeInterstitial,
  PROVIDER_ERROR_TYPES,
} from "../../open-sse/services/errorClassifier.ts";

const MANAGED = [
  '<!doctype html><span id="challenge-error-text">Enable JavaScript and cookies</span>',
  "<script>window._cf_chl_opt={cType:'managed',cZone:'chatgpt.com'};</script>",
  "/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1",
].join("");

test("#13161: Cloudflare managed challenge is a fingerprint rejection", () => {
  assert.equal(isCloudflareChallengeInterstitial(MANAGED), true);
  assert.equal(
    classifyProviderError(403, MANAGED, "codex"),
    PROVIDER_ERROR_TYPES.FINGERPRINT_REJECTION
  );
});

test("#13161: distinctive markers work in nested/escaped gateway bodies", () => {
  assert.equal(isCloudflareChallengeInterstitial("window._cf_chl_opt = {cType:'managed'}"), true);
  assert.equal(isCloudflareChallengeInterstitial("/cdn-cgi/challenge-platform/h/g"), true);
  assert.equal(isCloudflareChallengeInterstitial(String.raw`<span id=\"challenge-error-text\">`), true);
});

test("#13161: loose challenge prose and ordinary permission 403 stay unchanged", () => {
  assert.equal(isCloudflareChallengeInterstitial("security challenge required, retry later"), false);
  assert.equal(isCloudflareChallengeInterstitial("challenge-platform"), false);
  assert.equal(
    classifyProviderError(403, { error: { message: "you do not have permission" } }, "codex"),
    PROVIDER_ERROR_TYPES.FORBIDDEN
  );
});
