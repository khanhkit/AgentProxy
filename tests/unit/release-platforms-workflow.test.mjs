import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflowPath = ".github/workflows/release-platforms.yml";

function workflow() {
  return readFileSync(workflowPath, "utf8");
}

test("native release workflow covers every supported desktop OS/architecture on standard hosted runners", () => {
  const text = workflow();

  const expectedRunners = [
    "ubuntu-24.04",
    "ubuntu-24.04-arm",
    "windows-2025",
    "windows-11-arm",
    "macos-15-intel",
    "macos-15",
  ];
  for (const runner of expectedRunners) {
    assert.match(text, new RegExp(`runner: ${runner.replaceAll(".", "\\.")}`), `missing ${runner}`);
  }

  for (const platform of [
    "linux-x64",
    "linux-arm64",
    "windows-x64",
    "windows-arm64",
    "macos-x64",
    "macos-arm64",
  ]) {
    assert.match(text, new RegExp(`platform: ${platform}`), `missing ${platform}`);
  }

  assert.doesNotMatch(text, /self-hosted/);
});

test("native release workflow builds the web bundle once and rehydrates it on every native runner", () => {
  const text = workflow();
  assert.match(text, /name: Build shared Next standalone/);
  assert.match(text, /standaloneBundle\.mjs pack/);
  assert.match(text, /standaloneBundle\.mjs restore/);
  assert.match(text, /standaloneBundle\.mjs hydrate --platform/);
});

test("native release workflow never lets electron-builder publish directly and attaches artifacts to the AgentProxy release", () => {
  const text = workflow();
  assert.match(text, /release:\s*\n\s*types: \[released\]/);
  assert.match(text, /--publish never/);
  assert.match(text, /gh release upload/);
  assert.match(text, /AgentProxy-/);
});

test("manual dispatch is a safe build-only dry run unless asset publication is explicitly enabled", () => {
  const text = workflow();
  assert.match(text, /publish_assets:\s*\n\s*description:[\s\S]*?default: false/);
  assert.match(text, /needs\.prepare\.outputs\.publish_assets == 'true'/);
});
