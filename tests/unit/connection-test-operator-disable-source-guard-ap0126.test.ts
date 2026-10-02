import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/providers/[id]/test/route.ts"),
  "utf8"
);

test("connection test re-reads the uncached row after the probe", () => {
  assert.match(source, /await getProviderConnectionById\(connectionId\)/);
  assert.match(source, /const operatorDisabled = isOperatorDisabled\(latest\)/);
});

test("passing and skipped probes never re-enable an operator-disabled latest row", () => {
  assert.match(source, /latest\.isActive !== true && !operatorDisabled/);
  assert.match(source, /result\.valid && !operatorDisabled \? \{ isActive: true \}/);
});

test("key-health recovery uses the latest provider-specific state", () => {
  assert.match(source, /recoverKeyHealth\(connectionId, "primary", latest\.providerSpecificData\)/);
});
