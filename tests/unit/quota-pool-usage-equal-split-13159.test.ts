import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

for (const relativePath of [
  "src/lib/quota/sqliteQuotaStore.ts",
  "src/lib/quota/redisQuotaStore.ts",
]) {
  test(`${relativePath} mirrors enforcement equal-split fallback`, () => {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

    assert.match(
      source,
      /totalWeight > 0 \? alloc\.weight : allocations\.length > 0 \? 100 \/ allocations\.length : 0/
    );
    assert.doesNotMatch(source, /totalWeight > 0 \? alloc\.weight : 0/);
  });
}
