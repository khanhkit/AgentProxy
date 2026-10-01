import test from "node:test";
import assert from "node:assert/strict";

import { qwen_cloud_token_planProvider } from "../../open-sse/config/providers/registry/qwen-cloud-token-plan/index.ts";
import { deriveConfigFromRegistryModelsUrl } from "../../src/app/api/providers/[id]/models/discoveryConfig.ts";

const SPEC_MODELS_URL =
  "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/models";

test("qwen-cloud-token-plan exposes its live models URL", () => {
  assert.equal(qwen_cloud_token_planProvider.modelsUrl, SPEC_MODELS_URL);
});

test("qwen-cloud-token-plan derives OpenAI-style discovery config", () => {
  const config = deriveConfigFromRegistryModelsUrl("qwen-cloud-token-plan");
  assert.ok(config);
  assert.equal(config.url, SPEC_MODELS_URL);
  assert.equal(config.method, "GET");
  assert.equal(config.authHeader, "Authorization");
  assert.equal(config.authPrefix, "Bearer ");

  const models = config.parseResponse({
    data: [
      { id: "qwen3.8-max", object: "model" },
      { id: "qwen3.8-flash", object: "model" },
    ],
    object: "list",
  }) as Array<{ id: string }>;

  assert.deepEqual(
    models.map((model) => model.id),
    ["qwen3.8-max", "qwen3.8-flash"]
  );
});
