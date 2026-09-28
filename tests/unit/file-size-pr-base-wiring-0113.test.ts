import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("AP-ISS-0113: PR mode computes an independent base LOC map for test files", () => {
  const source = readFileSync(join(root, "scripts/check/check-file-size.mjs"), "utf8");
  assert.match(
    source,
    /const testBaseLoc = BASE_REF \? getBaseLoc\(BASE_REF, Object\.keys\(currentTests\)\) : undefined;/
  );
  assert.match(source, /evaluateFileSizes\(currentTests, testFrozen, testCap, testBaseLoc\)/);
});

test("AP-ISS-0113: CI lint passes the PR base SHA to the file-size ratchet", () => {
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /npm run check:file-size -- --base-ref "\$PR_BASE_SHA"/);
});
