import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { openferenceProvider } from "../../open-sse/config/providers/registry/openference/index.ts";
import { openference_apiProvider } from "../../open-sse/config/providers/registry/openference-api/index.ts";
import { APIKEY_PROVIDERS_INFERENCE } from "../../src/shared/constants/providers/apikey/inference-hosts.ts";
import { OAUTH_PROVIDERS } from "../../src/shared/constants/providers/oauth.ts";

const expectedModels = ["GLM-5.2", "Qwen3.8 27b", "Llama 3.2 3B"];

test("Openference OAuth and API-key fallback catalogs expose the refreshed free models", () => {
  assert.deepEqual(
    openferenceProvider.models?.map((m) => m.id),
    expectedModels
  );
  assert.deepEqual(
    openference_apiProvider.models?.map((m) => m.id),
    expectedModels
  );
});

test("Openference provider guidance names the current free-tier models", () => {
  const apiNote = APIKEY_PROVIDERS_INFERENCE["openference-api"].freeNote ?? "";
  const oauthNote = OAUTH_PROVIDERS.openference.freeNote ?? "";
  const authHint = OAUTH_PROVIDERS.openference.authHint ?? "";
  for (const text of [apiNote, oauthNote, authHint]) {
    assert.ok(text.includes("Qwen3.8 27b"));
    assert.ok(text.includes("Llama 3.2 3B"));
  }
});

test("Deyin asset ships with the catalog update", () => {
  assert.equal(fs.existsSync(path.join(process.cwd(), "public/deyin.svg")), true);
});
