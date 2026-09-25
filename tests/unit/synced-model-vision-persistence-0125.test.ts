import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const visionPath = path.join(root, "src/lib/db/models/syncedAvailableModelVision.ts");
const models = fs.readFileSync(path.join(root, "src/lib/db/models.ts"), "utf8");

test("TC-OMNIDB-VISION-050A: synced vision lookup bulk-loads and unions provider rows", () => {
  assert.ok(fs.existsSync(visionPath));
  const vision = fs.readFileSync(visionPath, "utf8");
  assert.match(vision, /namespace = 'syncedAvailableModels'/);
  assert.match(vision, /key\.split\(":"\)\[0\]/);
  assert.match(vision, /model\.supportsVision === true/);
  assert.match(vision, /result\.set\(providerId, byModel\)/);
});

test("TC-OMNIDB-VISION-050B: single lookup is positive-only and never downgrades another source", () => {
  assert.ok(fs.existsSync(visionPath));
  const vision = fs.readFileSync(visionPath, "utf8");
  assert.match(vision, /export function getSyncedAvailableModelVision\(/);
  assert.match(vision, /return bulk\.get\(providerId\)\?\.has\(modelId\) === true \? true : null/);
  assert.match(vision, /if \(collectVisionModelIds\(providerId, value\)\.includes\(modelId\)\) return true/);
  assert.match(vision, /return null/);
});

test("TC-OMNIDB-VISION-050C: synced vision helpers are exported through models facade", () => {
  assert.match(models, /getSyncedAvailableModelVision/);
  assert.match(models, /listSyncedAvailableModelVision/);
  assert.match(models, /SyncedAvailableModelVisionMap/);
});
