import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeUpstreamHeadersMap } from "../../src/lib/db/models.ts";
import {
  isForbiddenCustomHeaderName,
  isForbiddenUpstreamHeaderName,
} from "../../src/shared/constants/upstreamHeaders.ts";
import { checkFallbackError } from "../../open-sse/services/accountFallback.ts";
import { RateLimitReason } from "../../open-sse/config/constants.ts";

test("#13350: origin-IP forwarding headers are never forwarded upstream", () => {
  const blocked = [
    "X-Forwarded-For",
    "X-Real-IP",
    "CF-Connecting-IP",
    "True-Client-IP",
    "Client-IP",
    "Forwarded",
    "Via",
  ];
  const raw = Object.fromEntries(blocked.map((name) => [name, "203.0.113.9"]));
  raw["X-Custom"] = "kept";

  assert.deepEqual(sanitizeUpstreamHeadersMap(raw), { "X-Custom": "kept" });
  for (const name of blocked) {
    assert.equal(isForbiddenUpstreamHeaderName(name), true, `${name} upstream`);
    assert.equal(isForbiddenCustomHeaderName(name), true, `${name} custom`);
  }
});

test("#13350: upstream 413 is retryable model-capacity fallback", () => {
  const result = checkFallbackError(413, "tokens per minute limit exceeded", 0, null, "openai");
  assert.equal(result.shouldFallback, true);
  assert.equal(result.reason, RateLimitReason.MODEL_CAPACITY);
  assert.ok(result.cooldownMs >= 0);
});

test("#13350: TPM wording on a provider 400 is treated as fallback-worthy capacity", () => {
  for (const message of ["tokens per minute limit exceeded", "TPM exceeded"]) {
    const result = checkFallbackError(400, message, 0, null, "openai");
    assert.equal(result.shouldFallback, true, message);
    assert.equal(result.reason, RateLimitReason.MODEL_CAPACITY, message);
    assert.equal(result.cooldownMs, 0, message);
  }
});
