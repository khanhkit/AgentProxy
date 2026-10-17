import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeSyncedAvailableModels } from "@/lib/db/models/synced";
import { normalizeDiscoveredModels } from "@/lib/providerModels/modelDiscovery";

test("normalizeDiscoveredModels records only free evidence present in discovery payloads", () => {
  const models = normalizeDiscoveredModels(
    [
      { id: "declared-free", isFree: true },
      { id: "zero-priced", pricing: { prompt: "0", completion: 0 } },
      { id: "rotating-model:free" },
      { id: "blank-price", pricing: { prompt: "", completion: "" } },
      { id: "paid", pricing: { prompt: "1", completion: "2" } },
    ],
    "example-provider"
  );
  const byId = new Map(models.map((model) => [model.id, model]));

  assert.equal(byId.get("declared-free")?.isFree, true);
  assert.equal(byId.get("zero-priced")?.isFree, true);
  assert.equal(byId.get("rotating-model:free")?.isFree, true);
  assert.equal(byId.get("blank-price")?.isFree, undefined);
  assert.equal(byId.get("paid")?.isFree, undefined);
});

test("normalizeSyncedAvailableModels preserves discovery free metadata", () => {
  const [model] = normalizeSyncedAvailableModels([
    { id: "live-free", name: "Live Free", source: "imported", isFree: true },
  ]);

  assert.equal(model?.isFree, true);
});


test("AP-ISS-0198 4233381845/4233382269: synced metadata drops malformed provenance and unknown model types", () => {
  const [invalid] = normalizeSyncedAvailableModels([{
    id: "unsafe",
    metadataProvenance: { attacker: true },
    modelType: "shell",
  }]);
  assert.equal(invalid?.metadataProvenance, undefined);
  assert.equal(invalid?.modelType, undefined);

  const provenance = {
    vertexDocs: {
      source: "google-cloud-docs",
      sourceUrl: "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-pro?hl=en",
      fetchedAt: "2026-10-13T00:00:00.000Z",
      parserVersion: "vertex-docs-v1",
      confidence: "verified",
      fields: ["contextWindow"],
    },
  };
  const [valid] = normalizeSyncedAvailableModels([{ id: "safe", metadataProvenance: provenance, modelType: "chat" }]);
  assert.deepEqual(valid?.metadataProvenance, provenance);
  assert.equal(valid?.modelType, "chat");
});
