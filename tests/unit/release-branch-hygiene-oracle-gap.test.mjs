import assert from "node:assert/strict";
import test from "node:test";

import { assertTrustedCheckoutBeforeGuard } from "./release-branch-hygiene-oracle.mjs";

test("release checkout oracle rejects any worktree-mutating step between trusted checkout and guard", () => {
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

test("release checkout oracle rejects checkout inputs that can relocate or redirect trusted main", () => {
  const synthetic = [
    "  prepare:",
    "    steps:",
    "      - name: Checkout trusted release control plane",
    "        uses: actions/checkout@0123456789012345678901234567890123456789",
    "        with:",
    "          ref: main",
    "          persist-credentials: false",
    "          path: trusted-main",
    "      - name: Enforce main-only release branch invariant",
    "        run: node scripts/check/check-release-branch-hygiene.mjs",
    "",
  ].join("\n");

  assert.throws(
    () => assertTrustedCheckoutBeforeGuard(synthetic),
    /trusted checkout inputs|unexpected checkout input/u
  );
});
