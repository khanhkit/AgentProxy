import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("reasoning rule max/ultra gate honors registry and declared effort vocabularies", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/lib/reasoningRouting/policy.ts"),
    "utf8"
  );

  assert.match(source, /getProviderModels/);
  const fn =
    source.match(
      /function capabilityFor\([\s\S]*?\n\}\n\ntype RoutingInput/
    )?.[0] ?? "";

  assert.match(fn, /const declaredEfforts = capabilities\.supportedThinkingEfforts/);
  assert.match(fn, /const registryDeclared =/);
  assert.match(fn, /getProviderModels\(provider\)/);
  assert.match(fn, /entry\.aliases\?\.includes\(modelIdForRegistry\)/);
  assert.match(fn, /registryDeclared\.includes\(targetEffort\)/);
  assert.match(fn, /declaredEfforts\.includes\(targetEffort\)/);
});
