import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workflow = readFileSync(
  fileURLToPath(new URL("../../.github/workflows/docker-publish.yml", import.meta.url)),
  "utf8"
);
const buildWorkflow = readFileSync(
  fileURLToPath(new URL("../../.github/workflows/build.yml", import.meta.url)),
  "utf8"
);

test("native build workflow establishes a 12288 MB webpack heap budget", () => {
  assert.match(buildWorkflow, /AGENTPROXY_BUILD_MEMORY_MB:\s*"12288"/);
});

test("every Docker build-push block uses the same 12288 MB heap budget", () => {
  const blocks = [...workflow.matchAll(/build-args:\s*\|\n((?:\s{12}\S.*\n)+)/g)].map((match) => match[1]);
  assert.ok(blocks.length >= 1, "docker publish workflow must have at least one build-args block");
  for (const block of blocks) {
    assert.match(block, /AGENTPROXY_BUILD_MEMORY_MB=12288\b/);
  }
  assert.equal(
    (workflow.match(/docker\/build-push-action@/g) || []).length,
    blocks.length,
    "every build-push action must expose a checked build-args block"
  );
});
