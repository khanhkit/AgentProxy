import test from "node:test";
import assert from "node:assert/strict";
import { parseContextWindowOverrideInput } from "../../src/app/(dashboard)/dashboard/providers/[id]/providerPageHelpers.ts";

test("context override rejects Infinity and values outside safe integer range", () => {
  for (const input of ["9".repeat(400), "9007199254740992", "9999999999999999999999"]) {
    assert.deepEqual(parseContextWindowOverrideInput(input), { value: null, invalid: true });
  }
  assert.deepEqual(parseContextWindowOverrideInput("128000"), { value: 128000, invalid: false });
  assert.deepEqual(parseContextWindowOverrideInput(""), { value: null, invalid: false });
});
