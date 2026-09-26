import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";

const testDataDir = mkdtempSync(join(tmpdir(), "agentproxy-tier-policy-"));
const previousDataDir = process.env.DATA_DIR;
process.env.DATA_DIR = testDataDir;

const { resetDbInstance } = await import("../../src/lib/db/core.ts");
const { updatePricing, resetPricing } = await import("../../src/lib/db/settings/pricing.ts");
const { classifyTier, classifyTierAsync, setTierConfig } =
  await import("../../open-sse/services/tierResolver.ts");

beforeEach(() => setTierConfig({}));

after(async () => {
  setTierConfig({});
  resetDbInstance();
  if (previousDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previousDataDir;
  rmSync(testDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("AP-ISS-0124 async classification honors provider override before DB pricing", async () => {
  const provider = "qg-policy";
  const model = "provider-model";
  try {
    setTierConfig({ providerOverrides: [{ provider, tier: "premium" }] });
    await updatePricing({ [provider]: { [model]: { input: 0, output: 0 } } });
    const expected = classifyTier(provider, model);
    assert.equal(expected.tier, "premium");
    assert.deepEqual(await classifyTierAsync(provider, model), expected);
  } finally {
    await resetPricing(provider, model);
  }
});

test("AP-ISS-0124 async classification honors matching model override before DB pricing", async () => {
  const provider = "qg-model-policy";
  const model = "chat-pro";
  try {
    setTierConfig({
      modelOverrides: [{ provider, modelPattern: "chat-*", tier: "cheap" }],
    });
    await updatePricing({ [provider]: { [model]: { input: 20, output: 40 } } });
    const expected = classifyTier(provider, model);
    assert.equal(expected.tier, "cheap");
    assert.deepEqual(await classifyTierAsync(provider, model), expected);
  } finally {
    await resetPricing(provider, model);
  }
});

test("AP-ISS-0124 provider override keeps precedence over matching model override", async () => {
  const provider = "qg-precedence";
  const model = "chat";
  try {
    setTierConfig({
      providerOverrides: [{ provider, tier: "premium" }],
      modelOverrides: [{ provider, modelPattern: "*", tier: "cheap" }],
    });
    await updatePricing({ [provider]: { [model]: { input: 0, output: 0 } } });
    assert.equal((await classifyTierAsync(provider, model)).tier, "premium");
  } finally {
    await resetPricing(provider, model);
  }
});

test("AP-ISS-0124 no explicit policy still tracks DB pricing changes", async () => {
  const provider = "qg-cost-based";
  const model = "chat";
  try {
    await updatePricing({ [provider]: { [model]: { input: 0.5, output: 1 } } });
    assert.equal((await classifyTierAsync(provider, model)).tier, "cheap");
    await updatePricing({ [provider]: { [model]: { input: 5, output: 10 } } });
    const updated = await classifyTierAsync(provider, model);
    assert.equal(updated.tier, "premium");
    assert.equal(updated.costPer1MInput, 5);
    assert.equal(updated.costPer1MOutput, 10);
  } finally {
    await resetPricing(provider, model);
  }
});
