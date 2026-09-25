import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/db/core.ts"), "utf8");

test("TC-OMNIDB-LOAD-016: native SQLite load classifier catches non-callable exports", () => {
  assert.match(
    source,
    /isNativeSqliteLoadError[\s\S]{0,900}?message\.includes\("is not a function"\)/
  );
  assert.match(
    source,
    /isNativeSqliteLoadError[\s\S]{0,1000}?message\.includes\("is not a constructor"\)/
  );
});
