import assert from "node:assert/strict";
import test from "node:test";

import {
  FREE_MODEL_BUDGETS,
  computeFreeModelTotals,
} from "@agentproxy/open-sse/config/freeModelCatalog.ts";
import { REGISTRY } from "@agentproxy/open-sse/config/providerRegistry.ts";
import { AI_PROVIDERS, AGGREGATOR_PROVIDER_IDS } from "@/shared/constants/providers.ts";

const rows = FREE_MODEL_BUDGETS.filter((model) => model.provider === "xkiro");

test("xkiro is routable, canonical and classified as an aggregator", () => {
  assert.ok(REGISTRY.xkiro, "REGISTRY entry");
  assert.equal(REGISTRY.xkiro.format, "openai");
  assert.equal(REGISTRY.xkiro.baseUrl, "https://api.xkiro.com/v1/chat/completions");
  assert.ok(AI_PROVIDERS.xkiro, "canonical provider");
  assert.equal(AI_PROVIDERS.xkiro.hasFree, true);
  assert.ok(AGGREGATOR_PROVIDER_IDS.has("xkiro"));
});

test("xkiro free plan is one 5M/day account-wide pool = 150M/month, counted once", () => {
  assert.equal(rows.length, 39);
  for (const model of rows) {
    assert.equal(model.poolKey, "xkiro-free", model.modelId);
    assert.equal(model.monthlyTokens, 150_000_000, model.modelId);
    assert.equal(model.freeType, "recurring-daily", model.modelId);
    assert.equal(model.tos, "caution", model.modelId);
    assert.equal(model.hardStopGuaranteed, true, model.modelId);
    assert.equal(
      (model as { eligibilityGate?: unknown }).eligibilityGate,
      undefined,
      model.modelId
    );
  }
  const withXkiro = computeFreeModelTotals().steadyRecurringTokens;
  const withoutXkiro = computeFreeModelTotals({
    entries: FREE_MODEL_BUDGETS.filter((model) => model.provider !== "xkiro"),
  }).steadyRecurringTokens;
  assert.equal(withXkiro - withoutXkiro, 150_000_000);
});

test("xkiro never lists the undeclared-provenance codex-spark route", () => {
  assert.ok(!rows.some((model) => /codex-spark/i.test(model.modelId)));
  assert.ok(!REGISTRY.xkiro.models.some((model) => /codex-spark/i.test(model.id)));
});

test("every xkiro catalog row is a pinned registry model", () => {
  assert.equal(REGISTRY.xkiro.models.length, rows.length);
  const pinned = new Set(REGISTRY.xkiro.models.map((model) => model.id));
  for (const row of rows) assert.ok(pinned.has(row.modelId), row.modelId);
});
