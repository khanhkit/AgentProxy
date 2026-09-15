/** Regression guard: active GitHub Actions workflows must use GitHub-hosted runners only. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflowDir = path.join(repoRoot, ".github/workflows");

test("active workflows do not route jobs through self-hosted runners", () => {
  for (const name of fs.readdirSync(workflowDir)) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    const workflow = fs.readFileSync(path.join(workflowDir, name), "utf-8");
    assert.doesNotMatch(
      workflow,
      /runs-on:[^\n]*self-hosted/,
      `${name} must use GitHub-hosted runners only`
    );
    assert.doesNotMatch(
      workflow,
      /USE_VPS_RUNNER/,
      `${name} must not retain the VPS runner selector`
    );
  }
});

test("fast-gates specifically stays hosted", () => {
  // The holdout. 160 runs, zero self-hosted samples — dead configuration, and it would have
  // inherited the setup-node penalty the day it fired.
  const wf = fs.readFileSync(path.join(workflowDir, "quality.yml"), "utf-8");
  const block = wf.split(/^ {2}fast-gates:\s*$/m)[1] ?? "";
  const runsOn = /^ {4}runs-on:\s*(.+)$/m.exec(block);
  assert.ok(runsOn, "fast-gates must declare runs-on");
  assert.match(runsOn[1].trim(), /^ubuntu-latest$/, "fast-gates must be pinned, not switched");
});
