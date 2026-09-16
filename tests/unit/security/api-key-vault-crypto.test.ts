import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import {
  ApiKeyVaultError,
  decryptApiKeyBearer,
  encryptApiKeyBearer,
  getApiKeyVaultSecretPathForTests,
} from "../../../src/lib/db/apiKeyVault.ts";

const originalSecret = process.env.API_KEY_VAULT_SECRET;

test.afterEach(() => {
  if (originalSecret === undefined) delete process.env.API_KEY_VAULT_SECRET;
  else process.env.API_KEY_VAULT_SECRET = originalSecret;
});

test("vault uses authenticated row-bound ciphertext", () => {
  process.env.API_KEY_VAULT_SECRET = Buffer.alloc(32, 7).toString("base64url");
  const bearer = "sk_vault_test_secret_123456789";
  const ciphertext = encryptApiKeyBearer("row-a", bearer);
  assert.equal(ciphertext.includes(bearer), false);
  assert.equal(decryptApiKeyBearer("row-a", ciphertext), bearer);
  assert.throws(() => decryptApiKeyBearer("row-b", ciphertext), ApiKeyVaultError);
});

test("malformed operator vault secret fails closed", () => {
  process.env.API_KEY_VAULT_SECRET = "not-a-32-byte-base64url-secret";
  assert.throws(() => encryptApiKeyBearer("row-a", "secret"), ApiKeyVaultError);
});

test("zero-config vault root is persisted in the owner-only sidecar", () => {
  delete process.env.API_KEY_VAULT_SECRET;
  const ciphertext = encryptApiKeyBearer("row-zero-config", "zero-config-bearer");
  assert.equal(decryptApiKeyBearer("row-zero-config", ciphertext), "zero-config-bearer");
  const sidecar = getApiKeyVaultSecretPathForTests();
  assert.equal(fs.existsSync(sidecar), true);
  if (process.platform !== "win32") assert.equal(fs.statSync(sidecar).mode & 0o777, 0o600);
});
