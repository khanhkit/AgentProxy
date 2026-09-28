import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { COLLECTORS, findOrphans } from "../../scripts/check/check-test-discovery.mjs";

const projectRoot = process.cwd();
const historicalOrphans = [
  "tests/benchmarks/pipeline-accuracy.test.ts",
  "tests/golden-set/compression-caveman-v2.test.ts",
  "tests/golden-set/compression-quality.test.ts",
  "tests/golden-set/compression-savings.test.ts",
  "tests/golden-set/compression-upstream-parity.test.ts",
  "tests/integration/services/cliproxy-coexistence.test.ts",
  "tests/integration/services/full-lifecycle.int.test.ts",
  "tests/integration/services/route-guard-services.int.test.ts",
  "tests/live/deepseek-web-live.test.ts",
] as const;

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), "utf8")) as T;
}

test("AP-ISS-0105 wires every frozen orphan to an explicit runner", () => {
  const remaining = findOrphans(
    [...historicalOrphans],
    COLLECTORS.map((collector) => collector.glob)
  );
  assert.deepEqual(remaining, []);

  const pkg = readJson<{ scripts: Record<string, string> }>("package.json");
  assert.match(pkg.scripts["test:golden"], /tests\/golden-set\/\*\.test\.ts/);
  assert.match(pkg.scripts["test:benchmark:pipeline:live"], /pipeline-accuracy\.test\.ts/);
  assert.match(
    pkg.scripts["test:services:integration"],
    /tests\/integration\/services\/\*\.test\.ts/
  );
  assert.match(pkg.scripts["test:live:deepseek-web"], /deepseek-web-live\.test\.ts/);
});

test("AP-ISS-0105 keeps expensive/live runners outside default CI collectors", () => {
  const pkg = readJson<{ scripts: Record<string, string> }>("package.json");
  const defaultCommands = [
    pkg.scripts.test,
    pkg.scripts["test:unit"],
    pkg.scripts["test:integration"],
  ]
    .filter(Boolean)
    .join("\n");

  for (const pathFragment of [
    "tests/golden-set",
    "tests/benchmarks",
    "tests/integration/services",
    "tests/live",
  ]) {
    assert.equal(
      defaultCommands.includes(pathFragment),
      false,
      `${pathFragment} must remain non-default`
    );
  }

  assert.equal(pkg.scripts["test:services:integration"].includes("RUN_SERVICES_INT=1"), false);
  assert.equal(
    pkg.scripts["test:live:deepseek-web"].includes("DEEPSEEK_WEB_SESSION_COOKIE="),
    false
  );
});

test("AP-ISS-0105 removes the frozen orphan baseline", () => {
  const baseline = readJson<{ orphans: string[] }>("config/quality/test-discovery-baseline.json");
  assert.deepEqual(baseline.orphans, []);
});
