import test from "node:test";
import assert from "node:assert/strict";
import {
  createProviderSchema,
  createKeySchema,
  updateKeyPermissionsSchema,
  loginSchema,
} from "../../src/shared/validation/schemas.ts";

test("modular schemas: createProviderSchema validates correctly", () => {
  const valid = createProviderSchema.safeParse({
    name: "openai",
    provider: "openai",
    apiKey: "sk-1234",
  });
  assert.equal(valid.success, true);
});

test("modular schemas: createKeySchema validates correctly", () => {
  const valid = createKeySchema.safeParse({
    name: "test-key",
  });
  assert.equal(valid.success, true);
});

test("API key USD limits reject JSON booleans and strings instead of coercing them", () => {
  for (const invalid of [false, true, "12.5", ""]) {
    assert.equal(
      createKeySchema.safeParse({ name: "test-key", weeklyUsageLimitUsd: invalid }).success,
      false,
      `create weeklyUsageLimitUsd must reject ${JSON.stringify(invalid)}`
    );
    assert.equal(
      updateKeyPermissionsSchema.safeParse({ dailyUsageLimitUsd: invalid }).success,
      false,
      `update dailyUsageLimitUsd must reject ${JSON.stringify(invalid)}`
    );
  }

  for (const valid of [0, 12.5, null]) {
    assert.equal(
      createKeySchema.safeParse({ name: "test-key", weeklyUsageLimitUsd: valid }).success,
      true
    );
    assert.equal(updateKeyPermissionsSchema.safeParse({ dailyUsageLimitUsd: valid }).success, true);
  }
});
test("modular schemas: loginSchema validates correctly", () => {
  const valid = loginSchema.safeParse({
    password: "securepassword",
  });
  assert.equal(valid.success, true);

  const invalid = loginSchema.safeParse({
    password: "",
  });
  assert.equal(invalid.success, false);
});

test("validation helpers only export request-body helper APIs", async () => {
  const helpers = await import("../../src/shared/validation/helpers.ts");
  assert.equal("loginSchema" in helpers, false);
  assert.equal(typeof helpers.validateBody, "function");
  assert.equal(typeof helpers.isValidationFailure, "function");
});
