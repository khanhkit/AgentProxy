import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(".github/workflows/self-hosted-arm64.yml", "utf8");

test("ARM64 workflow uses the native GitHub-hosted ARM64 runner", () => {
  assert.doesNotMatch(workflow, /pull_request(?:_target)?:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /runs-on: ubuntu-24\.04-arm/);
  assert.doesNotMatch(workflow, /self-hosted/);
  assert.match(workflow, /test "\$\(uname -m\)" = "aarch64"/);
});

test("ARM64 workflow pins external GitHub actions to full commit SHAs", () => {
  const refs = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map(
    (match) => match[1]
  );
  assert.ok(refs.length >= 2);
  for (const ref of refs) {
    if (ref.startsWith("$/")) continue;
    assert.match(ref, /@[0-9a-f]{40}$/i, `${ref} must use a full commit SHA`);
  }
});
