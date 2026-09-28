import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "open-sse/services/compression/engines/rtk/index.ts"),
  "utf8"
);

test("RTK dedup gating depends only on explicit non-shell skipFilters", () => {
  assert.match(source, /const shouldSkipDedup = Boolean\(options\.skipFilters\);/);
  assert.doesNotMatch(
    source,
    /const shouldSkipDedup = options\.skipFilters \|\| isDocumentLikeRead;/
  );
});

test("document-like detection remains scoped to filter/truncation protection", () => {
  assert.match(source, /if \(!options\.skipFilters && !isDocumentLikeRead\)/);
  assert.match(source, /const truncated = isDocumentLikeRead/);
});
