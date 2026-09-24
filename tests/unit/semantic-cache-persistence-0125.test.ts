import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const settingsType = fs.readFileSync(path.join(root, "src/types/databaseSettings.ts"), "utf8");
const settingsDb = fs.readFileSync(path.join(root, "src/lib/db/databaseSettings.ts"), "utf8");
const models = fs.readFileSync(path.join(root, "src/lib/db/models.ts"), "utf8");
const synced = fs.readFileSync(path.join(root, "src/lib/db/models/synced.ts"), "utf8");

test("TC-OMNIDB-SEMCACHE-056A: DB settings expose opt-in vector-cache persistence with safe defaults", () => {
  for (const key of [
    "semanticCacheVectorEnabled",
    "semanticCacheBackend",
    "semanticCacheThreshold",
    "semanticCacheEmbeddingProvider",
    "semanticCacheEmbeddingModel",
    "semanticCacheEmbeddingDimension",
    "semanticCacheEmbeddingBaseUrl",
    "semanticCacheEmbeddingApiKey",
    "semanticCacheRedisUrl",
    "semanticCacheRedisPrefix",
    "semanticCacheRequireZeroTemp",
  ]) {
    assert.match(settingsType, new RegExp(key));
  }
  assert.match(settingsType, /semanticCacheMaxSize: 1000/);
  assert.match(settingsType, /semanticCacheVectorEnabled: false/);
  assert.match(settingsType, /semanticCacheBackend: "memory"/);
  assert.match(settingsType, /semanticCacheThreshold: 0\.8/);
  assert.match(settingsType, /semanticCacheRequireZeroTemp: true/);
});

test("TC-OMNIDB-SEMCACHE-056B: legacy flat settings migrate every vector-cache key", () => {
  for (const key of [
    "semanticCacheVectorEnabled",
    "semanticCacheBackend",
    "semanticCacheThreshold",
    "semanticCacheEmbeddingProvider",
    "semanticCacheEmbeddingModel",
    "semanticCacheEmbeddingDimension",
    "semanticCacheEmbeddingBaseUrl",
    "semanticCacheEmbeddingApiKey",
    "semanticCacheRedisUrl",
    "semanticCacheRedisPrefix",
    "semanticCacheRequireZeroTemp",
  ]) {
    assert.ok(settingsDb.includes(key + ': ["' + key + '"]'));
  }
  assert.match(settingsDb, /JSON\.stringify\(value \?\? null\)/);
});

test("TC-OMNIDB-SEMCACHE-056C: custom-model persistence carries embedding metadata without widening unrelated rows", () => {
  assert.match(models, /extraMeta\?: \{/);
  assert.match(models, /dimensions\?: number/);
  assert.match(models, /supportedInputTypes\?: string\[\]/);
  assert.match(models, /modelType\?: "chat" \| "embedding" \| "image" \| "rerank"/);
  assert.match(models, /typeof extraMeta\?\.dimensions === "number" && extraMeta\.dimensions > 0/);
  assert.match(models, /Array\.isArray\(extraMeta\?\.supportedInputTypes\)/);
  assert.match(models, /typeof extraMeta\?\.modelType === "string"/);
});

test("TC-OMNIDB-SEMCACHE-056D: synced-model type preserves embedding metadata", () => {
  assert.match(synced, /dimensions\?: number/);
  assert.match(synced, /supportedInputTypes\?: string\[\]/);
  assert.match(synced, /modelType\?: "chat" \| "embedding" \| "image" \| "rerank"/);
});

test("TC-OMNIDB-SEMCACHE-056E: synced-model normalization sanitizes metadata", () => {
  assert.match(synced, /typeof record\.dimensions === "number" && record\.dimensions > 0/);
  assert.match(synced, /record\.supportedInputTypes\.filter/);
  assert.match(synced, /typeof t === "string" && t\.length > 0/);
  assert.match(synced, /typeof record\.modelType === "string"/);
});
