import test from "node:test";
import assert from "node:assert/strict";

const { shouldClearSearchErrorAfterSuccess } =
  await import("../../open-sse/handlers/search/searchProxy.ts");

test("older recorded failures can be cleared after successful search", () => {
  assert.equal(
    shouldClearSearchErrorAfterSuccess(
      { lastErrorAt: "2026-10-11T09:00:00Z" },
      Date.parse("2026-10-11T09:01:00Z")
    ),
    true
  );
});

test("newer or unknown failures must not be cleared by an older success", () => {
  const started = Date.parse("2026-10-11T09:01:00Z");
  assert.equal(
    shouldClearSearchErrorAfterSuccess({ lastErrorAt: "2026-10-11T09:02:00Z" }, started),
    false
  );
  assert.equal(shouldClearSearchErrorAfterSuccess({ lastErrorAt: null }, started), false);
  assert.equal(shouldClearSearchErrorAfterSuccess({ lastErrorAt: "bad-date" }, started), false);
});
