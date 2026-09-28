import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dbCache = fs.readFileSync(path.join(root, "src/lib/db/providerLimits.ts"), "utf8");
const cache = fs.readFileSync(path.join(root, "src/lib/usage/providerLimitsCache.ts"), "utf8");
const limits = fs.readFileSync(path.join(root, "src/lib/usage/providerLimits.ts"), "utf8");

test("TC-OMNIDB-LIMIT-052A: persisted provider-limit cache preserves modelQuotas", () => {
  assert.match(dbCache, /modelQuotas\?: JsonRecord/);
  assert.match(dbCache, /const modelQuotas = toRecord\(record\.modelQuotas\)/);
  assert.match(dbCache, /\.\.\.\(modelQuotas \? \{ modelQuotas \} : \{\}\)/);
});

test("TC-OMNIDB-LIMIT-052B: live cache conversion stores modelQuotas", () => {
  assert.match(cache, /\.\.\.\(isRecord\(usage\.modelQuotas\) \? \{ modelQuotas: usage\.modelQuotas \} : \{\}\)/);
});

test("TC-OMNIDB-LIMIT-052C: stale fallback restores prior modelQuotas with quotas", () => {
  assert.match(limits, /modelQuotas: previous\.modelQuotas/);
});
