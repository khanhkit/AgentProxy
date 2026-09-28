import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const aliases = await import("../../open-sse/config/antigravityModelAliases.ts");

test("image quota visibility is broader than chat discovery", () => {
  assert.equal(aliases.isDiscoverableAntigravityModelId("gemini-3.1-flash-image"), false);
  assert.equal(typeof aliases.isUserVisibleAntigravityQuotaModelId, "function");
  assert.equal(aliases.isUserVisibleAntigravityQuotaModelId("gemini-3.1-flash-image"), true);
  assert.equal(aliases.isUserVisibleAntigravityQuotaModelId("gemini-3-pro-image-preview"), true);
  assert.equal(aliases.isUserVisibleAntigravityQuotaModelId("gemini-3.8-flash-high"), true);
  assert.equal(aliases.isUserVisibleAntigravityQuotaModelId("gemini-3.1-flash-tts-preview"), false);
  assert.equal(aliases.isUserVisibleAntigravityQuotaModelId("tab_flash_lite_preview"), false);
  assert.equal(aliases.isUserVisibleAntigravityQuotaModelId("gemini-3.5-flash-preview"), false);
});

test("Antigravity usage filtering uses quota visibility rather than chat discovery", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "open-sse/services/usage/antigravity.ts"),
    "utf8"
  );
  assert.match(source, /isUserVisibleAntigravityQuotaModelId/);
  assert.doesNotMatch(
    source,
    /(?:modelKey|String\(bucket\.modelId[^\n]*)[\s\S]{0,220}isDiscoverableAntigravityModelId/
  );
});
