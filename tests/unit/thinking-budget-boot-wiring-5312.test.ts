/**
 * TDD regression for #5312 (FIX A / RC-A wiring): hydrateThinkingBudgetConfig was
 * only called from `src/server-init.ts`, which is an UNUSED module that never runs
 * in production (the live boot path is the Next.js instrumentation hook →
 * `src/instrumentation-node.ts`). As a result the operator's dashboard
 * Thinking-Budget mode silently reverted to the passthrough default on every
 * restart, even though the unit test `thinking-budget-hydration-5312` (which calls
 * the function directly) passed. Surfaced by live VPS validation of #5312.
 *
 * This guard asserts the LIVE boot module actually calls the hydration, so the fix
 * can never again be wired into dead code without a failing test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const BOOT_PATH = join(here, "../../src/instrumentation-node.ts");

function stripComments(src: string): string {
  // Drop block comments and line comments so a commented-out call cannot satisfy
  // the guard (the original bug shipped with the real call living in dead code).
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("startup persists INITIAL_PASSWORD onboarding before runtime candidate hydration", () => {
  const code = stripComments(readFileSync(BOOT_PATH, "utf8"));
  const bootstrapIndex = code.indexOf("await ensureInitialSettingsBootstrap()");
  const candidateIndex = code.indexOf("await getSettingsCandidate()");

  assert.ok(
    bootstrapIndex >= 0,
    "instrumentation-node.ts must run the explicit INITIAL_PASSWORD bootstrap transaction"
  );
  assert.ok(
    candidateIndex > bootstrapIndex,
    "startup must persist onboarding state before reading the runtime settings candidate"
  );
});

test("#5312 RC-A: production boot activates the revisioned runtime candidate without one-off hydrators", () => {
  const code = stripComments(readFileSync(BOOT_PATH, "utf8"));
  assert.match(
    code,
    /applyRuntimeSettingsCandidate\s*\(\s*candidate\s*,/,
    "instrumentation-node.ts must activate the same revisioned runtime candidate used by live updates"
  );
  assert.doesNotMatch(code, /hydrateThinkingBudgetConfig\s*\(/);
  assert.doesNotMatch(code, /hydrateTaskRoutingConfig\s*\(/);
});
