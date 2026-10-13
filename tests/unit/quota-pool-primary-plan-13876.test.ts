import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("quota sharing resolves per-connection manual plans from the serving pool member", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/lib/quota/enforce.ts"), "utf8");

  const primaryMatches =
    source.match(/resolvePlan\((?:pool|matchedPool)\.connectionId, input\.provider\)/g) ?? [];
  const servingMatches = source.match(/resolvePlan\(input\.connectionId, input\.provider\)/g) ?? [];

  assert.equal(primaryMatches.length, 0);
  assert.equal(servingMatches.length, 2);
});
