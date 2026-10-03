import test from "node:test";
import assert from "node:assert/strict";
import {
  isAutoComboDeniedForKey,
  isComboNameAllowedForKey,
} from "../../src/shared/utils/apiKeyPolicy.ts";
import { updateKeyPermissionsSchema } from "../../src/shared/validation/schemas/keys.ts";

test("AP-ISS-0130 allowAutoCombos fails closed only for auto/*", () => {
  assert.equal(isAutoComboDeniedForKey({ allowAutoCombos: false }, "auto/free"), true);
  assert.equal(isAutoComboDeniedForKey({ allowAutoCombos: false }, "openai/gpt-4o"), false);
  assert.equal(isAutoComboDeniedForKey({ allowAutoCombos: true }, "auto/free"), false);
});

test("AP-ISS-0130 combo catalog access follows allowedCombos", () => {
  assert.equal(isComboNameAllowedForKey(undefined, "team-fast"), true);
  assert.equal(isComboNameAllowedForKey(["team-fast"], "team-fast"), true);
  assert.equal(isComboNameAllowedForKey(["combo/team-fast"], "team-fast"), true);
  assert.equal(isComboNameAllowedForKey(["team-safe"], "team-fast"), false);
});

test("AP-ISS-0130 key update schema persists auto-combo and catalog-scope fields", () => {
  assert.deepEqual(
    updateKeyPermissionsSchema.parse({ allowAutoCombos: false, catalogScope: "combos" }),
    { allowAutoCombos: false, catalogScope: "combos" }
  );
  assert.equal(updateKeyPermissionsSchema.safeParse({ catalogScope: "invalid" }).success, false);
});
