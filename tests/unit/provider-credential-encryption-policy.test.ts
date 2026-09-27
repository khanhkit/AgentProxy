import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_STORAGE_KEY = process.env.STORAGE_ENCRYPTION_KEY;
const ORIGINAL_ALLOW_PLAINTEXT = process.env.ALLOW_PLAINTEXT_PROVIDER_CREDENTIALS;

async function importFresh() {
  const url = pathToFileURL(path.resolve("src/lib/db/encryption.ts")).href;
  return import(`${url}?provider-policy=${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

function restoreEnv(): void {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;

  if (ORIGINAL_STORAGE_KEY === undefined) delete process.env.STORAGE_ENCRYPTION_KEY;
  else process.env.STORAGE_ENCRYPTION_KEY = ORIGINAL_STORAGE_KEY;

  if (ORIGINAL_ALLOW_PLAINTEXT === undefined)
    delete process.env.ALLOW_PLAINTEXT_PROVIDER_CREDENTIALS;
  else process.env.ALLOW_PLAINTEXT_PROVIDER_CREDENTIALS = ORIGINAL_ALLOW_PLAINTEXT;
}

test.afterEach(restoreEnv);
test.after(restoreEnv);

test("provider credential persistence fails closed in production when storage encryption key is missing", async () => {
  process.env.NODE_ENV = "production";
  delete process.env.STORAGE_ENCRYPTION_KEY;
  delete process.env.ALLOW_PLAINTEXT_PROVIDER_CREDENTIALS;
  const encryption = await importFresh();

  assert.throws(
    () =>
      encryption.encryptConnectionFields({ provider: "openai", apiKey: "sk-production-secret" }),
    /STORAGE_ENCRYPTION_KEY/
  );
});

test("provider credential persistence rejects a blank production storage encryption key", async () => {
  process.env.NODE_ENV = "production";
  process.env.STORAGE_ENCRYPTION_KEY = "   ";
  delete process.env.ALLOW_PLAINTEXT_PROVIDER_CREDENTIALS;
  const encryption = await importFresh();

  assert.throws(
    () =>
      encryption.encryptConnectionFields({ provider: "openai", accessToken: "production-token" }),
    /STORAGE_ENCRYPTION_KEY/
  );
});

test("development plaintext provider credentials require an explicit opt-in", async () => {
  process.env.NODE_ENV = "development";
  delete process.env.STORAGE_ENCRYPTION_KEY;
  delete process.env.ALLOW_PLAINTEXT_PROVIDER_CREDENTIALS;
  const encryption = await importFresh();

  assert.throws(
    () => encryption.encryptConnectionFields({ provider: "local-dev", apiKey: "dev-secret" }),
    /ALLOW_PLAINTEXT_PROVIDER_CREDENTIALS/
  );
});

test("development explicit plaintext opt-in preserves provider credential compatibility", async () => {
  process.env.NODE_ENV = "development";
  delete process.env.STORAGE_ENCRYPTION_KEY;
  process.env.ALLOW_PLAINTEXT_PROVIDER_CREDENTIALS = "1";
  const encryption = await importFresh();

  const connection = { provider: "local-dev", apiKey: "dev-secret", accessToken: "dev-token" };
  assert.deepEqual(encryption.encryptConnectionFields({ ...connection }), connection);
});

test("production provider credentials remain encrypted when a storage key is configured", async () => {
  process.env.NODE_ENV = "production";
  process.env.STORAGE_ENCRYPTION_KEY = "ap-iss-0050-production-key";
  process.env.ALLOW_PLAINTEXT_PROVIDER_CREDENTIALS = "1";
  const encryption = await importFresh();

  const encrypted = encryption.encryptConnectionFields({
    provider: "openai",
    apiKey: "sk-production-secret",
    refreshToken: "refresh-production-secret",
  });

  assert.match(encrypted.apiKey as string, /^enc:v1:/);
  assert.match(encrypted.refreshToken as string, /^enc:v1:/);
  assert.equal(encryption.decrypt(encrypted.apiKey), "sk-production-secret");
  assert.equal(encryption.decrypt(encrypted.refreshToken), "refresh-production-secret");
});

test("production provider credential persistence rejects cryptographic failure instead of plaintext fallback", async () => {
  process.env.NODE_ENV = "production";
  process.env.STORAGE_ENCRYPTION_KEY = "ap-iss-0050-production-key";
  delete process.env.ALLOW_PLAINTEXT_PROVIDER_CREDENTIALS;

  const crypto = require("node:crypto") as Record<string, unknown>;
  const originalRandomBytes = crypto.randomBytes;
  crypto.randomBytes = () => {
    throw new Error("synthetic entropy failure");
  };
  syncBuiltinESMExports();

  try {
    const encryption = await importFresh();
    assert.throws(
      () =>
        encryption.encryptConnectionFields({ provider: "openai", apiKey: "sk-production-secret" }),
      /encryption failed/
    );
  } finally {
    crypto.randomBytes = originalRandomBytes;
    syncBuiltinESMExports();
  }
});
