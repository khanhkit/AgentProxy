import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

import {
  AntigravityHandler,
  mergeAntigravityCatalog,
} from "../../src/mitm/handlers/antigravity.ts";
import { ANTIGRAVITY_TARGET } from "../../src/mitm/targets/antigravity.ts";
import { EMERGENCY_FALLBACK_CONFIG } from "../../open-sse/services/emergencyFallback.ts";
import { runHandler } from "./_mitmHandlerHarness.ts";

const require = createRequire(import.meta.url);
const {
  resolveForwardTarget,
}: {
  resolveForwardTarget: (baseUrl: string, body: unknown) => { url: string; format: string };
} = require("../../src/mitm/_internal/forwardTarget.cjs");

test("#14006 Antigravity target intercepts fetchAvailableModels", () => {
  assert.ok(ANTIGRAVITY_TARGET.endpointPatterns.includes("/v1internal:fetchAvailableModels"));
});

test("#14006 catalog merge injects AgentProxy models without overwriting native entries", () => {
  const upstream = {
    models: {
      "gemini-2.5-pro": {
        displayName: "Native Gemini",
        descriptionText: "Google native",
        quotaInfo: { remainingFraction: 1 },
      },
    },
    agentModelSorts: [{ groups: [{ modelIds: ["gemini-2.5-pro"] }] }],
  };

  const merged = mergeAntigravityCatalog(upstream, [
    { id: "gemini-2.5-pro", displayName: "must-not-overwrite" },
    { id: "auto/best-coding", displayName: "auto/best-coding" },
    { id: "my-combo", displayName: "My Combo", description: "Configured combo" },
  ]);

  const models = merged.models as Record<string, Record<string, unknown>>;
  assert.equal(models["gemini-2.5-pro"].displayName, "Native Gemini");
  assert.equal(models["gemini-2.5-pro"].descriptionText, "Google native");
  assert.equal(models["auto/best-coding"].displayName, "auto/best-coding");
  assert.equal(models["my-combo"].descriptionText, "Configured combo");
  assert.deepEqual(
    (
      merged.agentModelSorts as Array<{
        groups: Array<{ modelIds: string[] }>;
      }>
    )[0].groups[0].modelIds,
    ["auto/best-coding", "my-combo", "gemini-2.5-pro"]
  );
});

test("#14006 fetchAvailableModels response receives the dynamic catalog", async () => {
  const handler = new AntigravityHandler([
    {
      id: "auto/best-coding",
      displayName: "auto/best-coding",
      description: "AgentProxy built-in routing group",
    },
  ]);
  const upstream = {
    models: {
      "gemini-2.5-pro": {
        displayName: "Gemini 2.5 Pro",
      },
    },
    agentModelSorts: [{ groups: [{ modelIds: ["gemini-2.5-pro"] }] }],
  };

  const result = await runHandler(handler, {}, "unused", {
    url: "/v1internal:fetchAvailableModels",
    upstreamBody: JSON.stringify(upstream),
  });

  assert.equal(result.status, 200);
  assert.match(result.fetchUrl ?? "", /\/v1internal:fetchAvailableModels$/);
  const body = JSON.parse(result.responseChunks.join(""));
  assert.equal(body.models["auto/best-coding"].displayName, "auto/best-coding");
  assert.equal(body.models["gemini-2.5-pro"].displayName, "Gemini 2.5 Pro");
});

test("#14006 standalone frozen bridge is superseded by unified AgentProxy MITM routing", () => {
  const target = resolveForwardTarget("http://127.0.0.1:20128", {
    model: "auto/best-coding",
    request: { contents: [{ role: "user", parts: [{ text: "hi" }] }] },
  });

  assert.deepEqual(target, {
    url: "http://127.0.0.1:20128/v1/antigravity",
    format: "antigravity",
  });
  assert.equal(
    EMERGENCY_FALLBACK_CONFIG.provider,
    "nvidia",
    "do not restore the frozen Groq fallback regression"
  );
});

test("#14006 dynamic catalog source includes auto groups, active providers, and user combos", async () => {
  const { createCombo, deleteCombo } = await import("../../src/lib/db/combos.ts");
  const providersDb = await import("../../src/lib/db/providers.ts");
  const name = `antigravity-catalog-${Date.now()}`;
  await createCombo({
    id: name,
    name,
    description: "Configured combo",
    models: JSON.stringify(["antigravity/gemini-3.7-flash-high"]),
    strategy: "priority",
    isActive: true,
  });
  await providersDb.createProviderConnection({
    provider: "glm",
    authType: "apikey",
    name: "GLM catalog seed",
    apiKey: "sk-test-glm-antigravity-catalog",
    defaultModel: "glm-5.2",
  });

  try {
    const models = await new AntigravityHandler().getDynamicCatalogModels();
    const ids = new Set(models.map((model) => model.id));
    assert.ok(ids.has("auto/best-coding"));
    assert.ok(ids.has(name));
    assert.ok([...ids].some((id) => id.startsWith("glm/")));
  } finally {
    await deleteCombo(name);
  }
});
