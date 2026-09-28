import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cache = fs.readFileSync(path.join(root, "src/lib/db/readCache.ts"), "utf8");
const providers = fs.readFileSync(path.join(root, "src/lib/db/providers.ts"), "utf8");

test("TC-OMNIDB-CACHE-044A: connection invalidation can skip model catalog only when explicitly requested", () => {
  assert.match(cache, /opts\?: \{ skipModelCatalog\?: boolean \}/);
  assert.match(cache, /if \(opts\?\.skipModelCatalog\) return;/);
  assert.match(cache, /invalidateModelCatalogCache\(\);/);
});

test("TC-OMNIDB-CACHE-044B: backoff reset uses the routing-only invalidation mode", () => {
  const start = providers.indexOf("export async function resetConnectionBackoff");
  const end = providers.indexOf("\n}", start);
  const body = providers.slice(start, end + 2);
  assert.match(body, /invalidateDbCache\("connections", id, \{ skipModelCatalog: true \}\)/);
  assert.match(body, /bumpProxyConfigGeneration\(\)/);
});
