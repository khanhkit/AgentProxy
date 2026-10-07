import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/lib/guardrails/visionBridgeRouter.ts"),
  "utf8"
);

test("vision bridge remembers a no-candidate result with an explicit TTL", () => {
  assert.match(source, /noCandidateCacheTtlMs: number/);
  assert.match(source, /noCandidateCacheTtlMs: 30_000/);
  assert.match(source, /const noCandidateCache = new Map<string, number>\(\)/);
  assert.match(source, /const noCandidateUntil = noCandidateCache\.get\(cacheKey\)/);
  assert.match(source, /if \(noCandidateUntil > Date\.now\(\)\) return null/);
  assert.match(
    source,
    /if \(fullConfig\.noCandidateCacheTtlMs > 0\)[\s\S]*noCandidateCache\.set\(cacheKey, Date\.now\(\) \+ fullConfig\.noCandidateCacheTtlMs\)/
  );
});

test("usable selection and explicit cache clear invalidate negative cache", () => {
  assert.match(source, /noCandidateCache\.delete\(cacheKey\)/);
  assert.match(
    source,
    /export function clearSelectionCache\(\): void \{[\s\S]*selectionCache\.clear\(\);[\s\S]*noCandidateCache\.clear\(\);/
  );
});
