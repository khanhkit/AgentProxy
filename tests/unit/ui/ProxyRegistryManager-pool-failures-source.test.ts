import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(
  process.cwd(),
  "src/app/(dashboard)/dashboard/settings/components/ProxyRegistryManager.tsx"
);
const source = fs.readFileSync(file, "utf8");

test("pool editor wires scoped egress failure diagnostics into current UI surface", () => {
  assert.match(source, /fetch\(`\/api\/settings\/proxies\/egress\?\$\{poolQuery\(\)\}`\)/);
  assert.match(source, /data-testid="proxy-registry-pool-failure-breakdown"/);
  assert.match(source, /poolEgressFailuresByExit/);
  assert.match(source, /poolEgressFailuresUnattributed/);
  assert.doesNotMatch(source, /PoolEgressObservation/);
});
