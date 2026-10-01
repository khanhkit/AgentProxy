import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/(dashboard)/dashboard/media-providers/components/WebSearchExampleCard.tsx"
  ),
  "utf8"
);

test("AP-ISS-0130 web-search playground sends provider in request body", () => {
  assert.match(
    source,
    /const buildBody = \(\) => \(\{ query, max_results: numResults, provider: providerId \}\);/
  );
});

test("AP-ISS-0130 web-search playground preserves connection attribution header", () => {
  assert.match(source, /"x-connection-id": providerId/);
  assert.match(source, /body: JSON\.stringify\(buildBody\(\)\)/);
});
