import test from "node:test";
import assert from "node:assert/strict";
import { markIdenticalAsMissing } from "../../scripts/i18n/sync-ui-keys.mjs";

test("markIdenticalAsMissing flags English leaves and skips allowlisted AgentProxy terms", () => {
  const source = { common: { save: "Save", brand: "AgentProxy" }, x: { y: "Delete" } };
  const merged = { common: { save: "Save", brand: "AgentProxy" }, x: { y: "Excluir" } };
  const n = markIdenticalAsMissing(merged, source, new Set(["common.brand"]));
  assert.equal(n, 1);
  assert.deepEqual(merged, {
    common: { save: "__MISSING__:Save", brand: "AgentProxy" },
    x: { y: "Excluir" },
  });
});

test("markIdenticalAsMissing leaves placeholders, translations and empty strings alone", () => {
  const source = { a: "Alpha", b: "Beta", c: "", d: { e: "Echo" } };
  const merged = { a: "__MISSING__:Alpha", b: "Bêta", c: "", d: { e: "Echo" } };
  const n = markIdenticalAsMissing(merged, source, new Set());
  assert.equal(n, 1);
  assert.equal(merged.a, "__MISSING__:Alpha");
  assert.equal(merged.b, "Bêta");
  assert.equal(merged.c, "");
  assert.equal(merged.d.e, "__MISSING__:Echo");
});

test("markIdenticalAsMissing ignores missing targets and shape mismatches", () => {
  const source = { a: "Alpha", nested: { b: "Bravo" } };
  const merged = { nested: "Bravo" };
  assert.equal(markIdenticalAsMissing(merged, source, new Set()), 0);
  assert.deepEqual(merged, { nested: "Bravo" });
});
