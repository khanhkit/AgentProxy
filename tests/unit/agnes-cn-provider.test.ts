import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import DefaultExecutor from "../../open-sse/executors/default.ts";
import { VIDEO_PROVIDER_IDS } from "../../src/shared/constants/providers.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-agnes-cn-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const { REGISTRY } = await import("../../open-sse/config/providerRegistry.ts");
const { APIKEY_PROVIDERS } = await import("../../src/shared/constants/providers.ts");
const { IMAGE_PROVIDERS } = await import("../../open-sse/config/imageRegistry.ts");
const { FREE_MODEL_BUDGETS } = await import("../../open-sse/config/freeModelCatalog.ts");
const { resolveProviderAlias, parseModel } = await import("../../open-sse/services/model.ts");
const { sanitizeReasoningEffortForProvider } =
  await import("../../open-sse/executors/base/reasoningEffort.ts");
const { isNamedOpenAIStyleProvider } =
  await import("../../src/app/api/providers/[id]/models/discovery/providerSets.ts");
const { getDiscoveryClass } = await import("../../src/lib/providerModels/discoveryClass.ts");

const CN_CHAT_URL = "https://api.agnes-ai.cn/v1/chat/completions";
const INTL_CHAT_URL = "https://apihub.agnes-ai.com/v1/chat/completions";

test.after(() => fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }));

test("agnes-cn is a distinct China-hosted provider", () => {
  assert.equal(REGISTRY["agnes-cn"].baseUrl, CN_CHAT_URL);
  assert.equal(REGISTRY.agnes.baseUrl, INTL_CHAT_URL);
  assert.equal(resolveProviderAlias("agnescn"), "agnes-cn");
  assert.equal(parseModel("agnes-cn/agnes-2.5-flash").provider, "agnes-cn");
  assert.equal(new DefaultExecutor("agnes-cn").buildUrl("agnes-2.5-flash", false), CN_CHAT_URL);
});

test("agnes-cn participates in live OpenAI-compatible discovery independently", () => {
  assert.equal(isNamedOpenAIStyleProvider("agnes"), true);
  assert.equal(isNamedOpenAIStyleProvider("agnes-cn"), true);
  assert.equal(getDiscoveryClass("agnes-cn"), "openai-compat");
});

test("agnes-cn free catalog uses one unmetered CN pool", () => {
  const rows = FREE_MODEL_BUDGETS.filter((model) => model.provider === "agnes-cn");
  assert.deepEqual(
    rows.map((model) => model.modelId),
    ["agnes-2.0-flash", "agnes-2.5-flash", "agnes-3.0-flash"]
  );
  assert.ok(rows.every((model) => model.poolKey === "agnes-cn-free"));
  assert.ok(rows.every((model) => model.freeType === "recurring-uncapped"));
});

test("agnes-cn declares and clamps the live reasoning-effort vocabulary", () => {
  const models = REGISTRY["agnes-cn"].models;
  assert.deepEqual(
    models.find((model) => model.id === "agnes-2.5-flash")?.supportedThinkingEfforts,
    ["none", "low", "medium", "high", "max"]
  );
  assert.deepEqual(
    models.find((model) => model.id === "agnes-3.0-flash")?.supportedThinkingEfforts,
    ["none", "minimal", "low", "medium", "high", "xhigh", "max"]
  );
  const clamp = (model: string, effort: string) =>
    (
      sanitizeReasoningEffortForProvider({ reasoning_effort: effort }, "agnes-cn", model) as {
        reasoning_effort?: string;
      }
    ).reasoning_effort;
  assert.equal(clamp("agnes-2.5-flash", "xhigh"), "max");
  assert.equal(clamp("agnes-2.5-flash", "off"), "none");
  assert.equal(clamp("agnes-3.0-flash", "xhigh"), "xhigh");
});

test("agnes-cn is LLM-only and has dashboard metadata", () => {
  assert.equal(IMAGE_PROVIDERS["agnes-cn"], undefined);
  assert.equal(VIDEO_PROVIDER_IDS.has("agnes-cn"), false);
  assert.match(APIKEY_PROVIDERS["agnes-cn"].name, /China/);
  assert.equal(APIKEY_PROVIDERS["agnes-cn"].hasFree, true);
});

test("every current locale carries an agnes-cn onboarding description", () => {
  const dir = path.join(REPO_ROOT, "src/i18n/messages");
  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".json"));
  assert.equal(files.length, 51);
  for (const file of files) {
    const messages = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const description = messages?.providers?.onboardingProviderDescriptions?.["agnes-cn"];
    assert.equal(typeof description, "string", `${file} missing agnes-cn description`);
    assert.ok(description.length > 0, `${file} has empty agnes-cn description`);
  }
});
