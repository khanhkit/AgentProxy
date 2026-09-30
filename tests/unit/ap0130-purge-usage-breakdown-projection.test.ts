import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/settings/purge-usage-history/route.ts"),
  "utf8"
);

test("AP-ISS-0130 purge-usage response exposes compression engine breakdown deletions", () => {
  assert.match(
    source,
    /deletedCompressionEngineBreakdown:\s*result\.deletedCompressionEngineBreakdown/
  );
});
