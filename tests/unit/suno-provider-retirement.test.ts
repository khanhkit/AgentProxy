import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const { APIKEY_PROVIDERS } = await import("../../src/shared/constants/providers.ts");
const { MUSIC_PROVIDERS } = await import("../../open-sse/config/musicRegistry.ts");
const { REGISTRY } = await import("../../open-sse/config/providers/index.ts");

test("retired direct Suno provider is absent from provider and music registries", () => {
  assert.equal(APIKEY_PROVIDERS.suno, undefined);
  assert.equal(MUSIC_PROVIDERS.suno, undefined);
  assert.equal(REGISTRY.suno, undefined);
});

test("retired direct Suno handler and registry module are gone", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../..");
  const handler = fs.readFileSync(path.join(root, "open-sse/handlers/musicGeneration.ts"), "utf8");
  assert.doesNotMatch(handler, /providerConfig\.format === ["']suno-music["']/);
  assert.doesNotMatch(handler, /function handleSunoMusicGeneration/);
  assert.equal(
    fs.existsSync(path.join(root, "open-sse/config/providers/registry/suno/index.ts")),
    false
  );
});
