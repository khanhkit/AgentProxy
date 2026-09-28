import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.join(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");

for (const file of ["src/lib/db/core.ts","src/lib/db/jsonMigration.ts"]) {
  test(`TC-OMNIDB-RATE-032: ${file} preserves per-connection overrides across INSERT OR REPLACE`,()=>{
    const source=read(file);
    assert.match(source,/serializeJsonField/);
    assert.match(source,/rate_limit_overrides_json/);
    assert.match(source,/SELECT rate_limit_overrides_json FROM provider_connections WHERE id = \?/);
    assert.match(source,/const hasOverrides = conn\.rateLimitOverrides != null/);
    assert.match(source,/let rateLimitOverridesJson = serializeJsonField\(conn\.rateLimitOverrides\)/);
    assert.match(source,/if \(!hasOverrides && typeof conn\.id === "string"\)/);
    assert.match(source,/rateLimitOverridesJson,/);
  });
}
