import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"../..");
const source=fs.readFileSync(path.join(root,"src/lib/db/compressionCombos.ts"),"utf8");

test("TC-OMNIDB-COMP-033A: default compression seed is lossless",()=>{
  assert.match(source,/Default lossless dedup and whitespace compression/);
  assert.match(source,/return \[\{ engine: "session-dedup" \}, \{ engine: "lite" \}\]/);
});

test("TC-OMNIDB-COMP-033B: untouched lossy RTK+Caveman seed is recognized for upgrade",()=>{
  assert.match(source,/LEGACY_RTK_CAVEMAN_DESCRIPTION/);
  assert.match(source,/pipeline\[0\]\?\.engine === "rtk"/);
  assert.match(source,/pipeline\[1\]\?\.engine === "caveman"/);
});

test("TC-OMNIDB-COMP-033C: edited/renamed combos remain untouched",()=>{
  assert.match(source,/const untouchedSeed =/);
  assert.match(source,/if \(!isSeededMetadata \|\| !untouchedSeed\) return/);
});
