import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"../..");
const source=fs.readFileSync(path.join(root,"src/lib/db/cleanup.ts"),"utf8");

test("TC-OMNIDB-CLEAN-034A: compression engine breakdown follows compression retention",()=>{
  assert.match(source,/export async function cleanupCompressionEngineBreakdown/);
  assert.match(source,/retention\.compressionAnalytics/);
  assert.match(source,/DELETE FROM compression_engine_breakdown WHERE timestamp < \?/);
});

test("TC-OMNIDB-CLEAN-034B: auto-cleanup includes compression engine breakdown",()=>{
  assert.match(source,/compressionEngineBreakdown:\s*await cleanupCompressionEngineBreakdown\(\)/);
});

test("TC-OMNIDB-CLEAN-034C: usage reset deletes compression engine breakdown",()=>{
  assert.match(source,/deletedCompressionEngineBreakdown:\s*number/);
  assert.match(source,/table: "compression_engine_breakdown"[\s\S]{0,150}?resultKey: "deletedCompressionEngineBreakdown"/);
  assert.match(source,/deletedCompressionEngineBreakdown:\s*0/);
});
