import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/db/settings/pricing.ts"), "utf8");

test("TC-OMNIDB-PRICE-039A: per-model pricing reads through the pricing cache", () => {
  assert.match(source, /import \{ getCachedPricing, invalidateDbCache \} from "\.\.\/readCache"/);
  const start = source.indexOf("export async function getPricingForModel");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end + 2);
  assert.match(body, /await getCachedPricing\(\)/);
  assert.doesNotMatch(body, /await getPricing\(\)/);
});

test("TC-OMNIDB-PRICE-039B: pricing writers invalidate the same cache", () => {
  assert.match(source, /invalidateDbCache\("pricing"\)/);
  assert.ok((source.match(/await touchPricing\(\)/g) ?? []).length >= 3);
});
