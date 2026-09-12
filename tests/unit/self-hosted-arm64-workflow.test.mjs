import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(".github/workflows/self-hosted-arm64.yml", "utf8");

test("self-hosted ARM64 workflow is trusted-only and isolated", () => {
  assert.doesNotMatch(workflow, /pull_request(?:_target)?:/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /runs-on: \[self-hosted, Linux, ARM64, agentproxy-secure, kitmcp-arm64\]/);
  assert.match(workflow, /test ! -S \/var\/run\/docker\.sock/);
  assert.match(workflow, /test "\$\(id -u\)" -ne 0/);
});

test("self-hosted workflow pins external GitHub actions to full commit SHAs", () => {
  const refs = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map(
    (match) => match[1]
  );
  assert.ok(refs.length >= 2);
  for (const ref of refs) {
    if (ref.startsWith("$/")) continue;
    assert.match(ref, /@[0-9a-f]{40}$/i, `${ref} must use a full commit SHA`);
  }
});
