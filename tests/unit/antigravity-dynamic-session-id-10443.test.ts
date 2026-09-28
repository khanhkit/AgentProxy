import assert from "node:assert/strict";
import { test } from "node:test";
import { getAntigravitySessionId } from "../../open-sse/services/antigravityIdentity.ts";

test("getAntigravitySessionId is stable per account and keeps explicit fallback precedence", () => {
  const credentials = { email: "user@example.com", connectionId: "conn_123" };

  const id1 = getAntigravitySessionId(credentials);
  const id2 = getAntigravitySessionId(credentials);

  assert.equal(id1, id2, "same account should reuse a stable prompt-cache session");
  assert.notEqual(
    getAntigravitySessionId({ email: "other@example.com" }),
    id1,
    "different accounts should produce different sessions"
  );

  const explicitFallback = "custom-session-456";
  assert.equal(getAntigravitySessionId(credentials, explicitFallback), explicitFallback);
});

test("getAntigravitySessionId stays random when no account identity exists", () => {
  assert.notEqual(getAntigravitySessionId(), getAntigravitySessionId());
});
