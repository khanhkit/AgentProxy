import test from "node:test";
import assert from "node:assert/strict";

const {
  detectModelFamily,
  buildFamilyCandidateFilter,
  isValidModelFamily,
  AUTO_FAMILY_IDS,
} = await import("../../open-sse/services/autoCombo/modelFamily.ts");
const builtinCatalog = await import("../../open-sse/services/autoCombo/builtinCatalog.ts");

test("#13214: new model families are detected and advertised", () => {
  const cases = [
    ["moonshot/kimi-k3", "kimi"],
    ["QWEN3-14B", "qwen"],
    ["qwen2.5-coder-32b-instruct", "qwen"],
    ["deepseek/deepseek-chat", "deepseek"],
    ["openai/gpt-4o", "gpt"],
  ] as const;
  for (const [model, family] of cases) {
    assert.equal(detectModelFamily(model), family);
    assert.equal(isValidModelFamily(family), true);
    assert.ok(AUTO_FAMILY_IDS.includes(`auto/${family}`));
  }
  assert.equal(detectModelFamily("k3"), null);
  assert.equal(detectModelFamily("not-qwen3"), null);
});

test("#13214: Kimi bare k3 is limited to known Kimi backends", () => {
  const filter = buildFamilyCandidateFilter("kimi");
  for (const provider of ["kimi-coding", "kimi-web", "kimi-coding-apikey"]) {
    assert.equal(filter({ provider, model: "k3" }), true, provider);
    assert.equal(filter({ provider, model: `${provider}/k3` }), true, provider);
  }
  assert.equal(filter({ provider: "custom", model: "k3" }), false);
  assert.equal(filter({ provider: "moonshot", model: "kimi-k2.5" }), true);
});

test("#13214: Claude Haiku maps to fast without changing Opus/Sonnet variants", () => {
  assert.equal(builtinCatalog.AUTO_TEMPLATE_VARIANTS["auto/claude-haiku"], "fast");
  assert.equal(builtinCatalog.AUTO_TEMPLATE_VARIANTS["auto/claude-opus"], "smart");
  assert.equal(builtinCatalog.AUTO_TEMPLATE_VARIANTS["auto/claude-sonnet"], "coding");
  assert.equal(builtinCatalog.isRecognizedBuiltinAuto("auto/claude-haiku", "claude-haiku"), true);
});
