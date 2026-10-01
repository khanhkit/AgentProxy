import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-db-secrets-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const secretsDb = await import("../../src/lib/db/secrets.ts");

async function resetStorage() {
  core.resetDbInstance();

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      if (fs.existsSync(TEST_DATA_DIR)) {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
      break;
    } catch (error: any) {
      if ((error?.code === "EBUSY" || error?.code === "EPERM") && attempt < 9) {
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      } else {
        throw error;
      }
    }
  }

  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(async () => {
  await resetStorage();
});

test.after(async () => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("getPersistedSecret returns null for missing keys", () => {
  assert.equal(secretsDb.getPersistedSecret("missing"), null);
});

test("persistSecret stores owner-only secret material and a non-secret DB marker", () => {
  const key = "oauth_token";
  const secret = "secret-value";
  secretsDb.persistSecret(key, secret);

  assert.equal(secretsDb.getPersistedSecret(key), secret);

  const row = core
    .getDbInstance()
    .prepare("SELECT value FROM key_value WHERE namespace = 'secrets' AND key = ?")
    .get(key) as { value?: string } | undefined;
  assert.ok(row);
  assert.equal(row.value?.includes(secret), false);

  const digest = crypto.createHash("sha256").update(key).digest("hex");
  const secretDir = path.join(TEST_DATA_DIR, "secrets");
  const secretPath = path.join(secretDir, `${digest}.secret`);
  assert.equal(fs.readFileSync(secretPath, "utf8"), secret);

  if (process.platform !== "win32") {
    assert.equal(fs.statSync(secretDir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(secretPath).mode & 0o777, 0o600);
  }
});

test("persistSecret does not overwrite an existing secret because storage is insert-only", () => {
  secretsDb.persistSecret("api_token", "first-value");
  secretsDb.persistSecret("api_token", "second-value");

  assert.equal(secretsDb.getPersistedSecret("api_token"), "first-value");
});

test("getPersistedSecret migrates legacy plaintext DB rows to protected storage", () => {
  const key = "legacy-signing-secret";
  const secret = "legacy-plaintext-secret";
  const db = core.getDbInstance();
  db.prepare("INSERT INTO key_value (namespace, key, value) VALUES (?, ?, ?)").run(
    "secrets",
    key,
    JSON.stringify(secret)
  );

  assert.equal(secretsDb.getPersistedSecret(key), secret);

  const row = db
    .prepare("SELECT value FROM key_value WHERE namespace = 'secrets' AND key = ?")
    .get(key) as { value?: string } | undefined;
  assert.ok(row);
  assert.equal(row.value?.includes(secret), false);
});

test("malformed persisted rows are treated as missing secrets", () => {
  const db = core.getDbInstance();
  db.prepare("INSERT INTO key_value (namespace, key, value) VALUES (?, ?, ?)").run(
    "secrets",
    "broken",
    "not-json"
  );

  assert.equal(secretsDb.getPersistedSecret("broken"), null);
});
