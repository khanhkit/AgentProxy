import test from "node:test";
import assert from "node:assert/strict";

const { resolveOperatorUsageFields } =
  await import("../../src/app/api/free-tier/summary/usageVisibility.ts");

test("AP-ISS-0130 unauthenticated free-tier summary withholds operator usage without touching the usage DB", () => {
  let calls = 0;
  const fields = resolveOperatorUsageFields(false, 1_000_000, () => {
    calls += 1;
    throw new Error("usage loader must not run for public callers");
  });

  assert.deepEqual(fields, { usedThisMonth: null, remaining: null });
  assert.equal(calls, 0);
});

test("AP-ISS-0130 authenticated free-tier summary exposes usage and clamps remaining at zero", () => {
  assert.deepEqual(
    resolveOperatorUsageFields(true, 1_000, () => 250),
    {
      usedThisMonth: 250,
      remaining: 750,
    }
  );
  assert.deepEqual(
    resolveOperatorUsageFields(true, 1_000, () => 1_500),
    {
      usedThisMonth: 1_500,
      remaining: 0,
    }
  );
});
