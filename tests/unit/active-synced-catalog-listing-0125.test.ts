import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(root, "src/lib/db/models/activeSyncedCatalog.ts"), "utf8");

test("TC-OMNIDB-CATALOG-053: listing-only active synced catalog excludes operator custom models", () => {
  const start = src.indexOf("export async function getAllActiveSyncedModels");
  const end = src.indexOf("\n/**", start);
  const body = src.slice(start, end > start ? end : undefined);
  assert.match(body, /collectModelsForConnections\(modelsByConnection, connectionIds\)/);
  assert.doesNotMatch(body, /unionCustomModels/);
});
