import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"../..");
const core=fs.readFileSync(path.join(root,"src/lib/db/core.ts"),"utf8");
const health=fs.readFileSync(path.join(root,"src/lib/db/healthCheck.ts"),"utf8");

test("TC-OMNIDB-HEALTH-024A: managed DB health API can waive integrity scans",()=>{
  assert.match(
    core,
    /type ManagedHealthCheckOptions = \{[\s\S]{0,140}?autoRepair\?: boolean;[\s\S]{0,140}?skipIntegrityCheck\?: boolean;[\s\S]{0,80}?\};/
  );
  assert.match(core,/runManagedDbHealthCheck\(options\?: ManagedHealthCheckOptions\)/);
  assert.match(
    core,
    /runManagedDbHealthCheck[\s\S]{0,420}?skipIntegrityCheck:\s*options\?\.skipIntegrityCheck === true/
  );
});

test("TC-OMNIDB-HEALTH-024B: low-level health checker already treats integrity skip as explicit option",()=>{
  assert.match(health,/skipIntegrityCheck\?: boolean/);
  assert.match(health,/if \(!options\.skipIntegrityCheck\)[\s\S]{0,300}?quick_check/);
});
