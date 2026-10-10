import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { load as loadYaml } from "js-yaml";

function loadCheckoutOracle() {
  const source = readFileSync(
    new URL("./release-branch-hygiene.test.mjs", import.meta.url),
    "utf8"
  );
  const start = source.indexOf("function isRecord(value)");
  const end = source.indexOf('test("release branch hygiene accepts exactly main"');
  assert.ok(
    start >= 0 && end > start,
    "release checkout oracle helper source must be discoverable"
  );
  const context = { assert, loadYaml, result: null };
  runInNewContext(
    `${source.slice(start, end)}\nresult = assertTrustedCheckoutBeforeGuard;`,
    context
  );
  assert.equal(typeof context.result, "function");
  return context.result;
}

test("release checkout oracle rejects any worktree-mutating step between trusted checkout and guard", () => {
  const assertTrustedCheckoutBeforeGuard = loadCheckoutOracle();
  const synthetic = [
    "  prepare:",
    "    steps:",
    "      - name: Checkout trusted release control plane",
    "        uses: actions/checkout@0123456789012345678901234567890123456789",
    "        with:",
    "          ref: main",
    "          persist-credentials: false",
    "      - name: Replace trusted worktree after checkout",
    "        run: git reset --hard attacker-controlled-ref",
    "      - name: Enforce main-only release branch invariant",
    "        run: node scripts/check/check-release-branch-hygiene.mjs",
    "",
  ].join("\n");

  assert.throws(
    () => assertTrustedCheckoutBeforeGuard(synthetic),
    /immediately precede|intervening step/u
  );
});
