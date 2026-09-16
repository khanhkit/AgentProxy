import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  createApiKey,
  getApiKeys,
  getApiKeysCount,
  migrateLegacyApiKeyVaultRows,
  recoverApiKeyById,
  regenerateApiKey,
  resetApiKeyState,
  validateApiKey,
} from "../../../src/lib/db/apiKeys.ts";
import { DATA_DIR, SQLITE_FILE, getDbInstance } from "../../../src/lib/db/core.ts";

const VALID_VAULT_SECRET = Buffer.alloc(32, 19).toString("base64url");
process.env.API_KEY_SECRET = "test-only-api-key-crc-secret-0092";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("new API bearer is encrypted at rest and absent from a native DB backup", async () => {
  process.env.API_KEY_VAULT_SECRET = VALID_VAULT_SECRET;
  const created = await createApiKey("vault-persistence", "machine-vault-persistence", ["manage"]);
  const db = getDbInstance();
  const row = db
    .prepare("SELECT key, key_ciphertext, key_hash, key_prefix FROM api_keys WHERE id = ?")
    .get(created.id) as {
    key: string | null;
    key_ciphertext: string | null;
    key_hash: string | null;
    key_prefix: string | null;
  };

  assert.ok(row, "created API key row must exist");
  assert.notEqual(row.key, created.key, "SQLite row must not retain the reusable bearer plaintext");
  assert.equal(row.key?.includes("#vault:"), true);
  assert.equal(row.key_ciphertext?.includes(created.key), false);
  assert.match(row.key_hash ?? "", /^[a-f0-9]{64}$/);
  assert.equal(row.key_prefix, created.key.slice(0, 12));
  assert.equal(await recoverApiKeyById(created.id), created.key);

  const backupPath = path.join(DATA_DIR, `api-key-vault-${created.id}.sqlite`);
  await db.backup(backupPath);
  assert.equal(fs.readFileSync(backupPath).includes(Buffer.from(created.key)), false);
});

test("hash authentication remains available when vault recovery is unavailable", async () => {
  process.env.API_KEY_VAULT_SECRET = VALID_VAULT_SECRET;
  const created = await createApiKey("hash-only-auth", "machine-hash-only-auth");
  process.env.API_KEY_VAULT_SECRET = "malformed-vault-secret";

  assert.equal(await validateApiKey(created.key), true);
  await assert.rejects(() => recoverApiKeyById(created.id), /vault secret/i);
});

test("create fails closed before persistence when vault configuration is invalid", async () => {
  const before = getApiKeysCount();
  process.env.API_KEY_VAULT_SECRET = "malformed-vault-secret";
  await assert.rejects(
    () => createApiKey("must-not-persist", "machine-must-not-persist"),
    /vault secret/i
  );
  assert.equal(getApiKeysCount(), before);
});

test("legacy plaintext migration verifies metadata, encrypts, and is idempotent", async () => {
  process.env.API_KEY_VAULT_SECRET = VALID_VAULT_SECRET;
  const db = getDbInstance();
  const bearer = "sk_legacy_vault_0092_exact_marker";
  const id = "legacy-vault-row-0092";
  db.prepare(
    "INSERT INTO api_keys (id, name, key, machine_id, created_at, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, "legacy-vault", bearer, "machine-legacy", new Date().toISOString(), sha256(bearer), bearer.slice(0, 12));

  assert.equal(await migrateLegacyApiKeyVaultRows(), 1);
  assert.equal(await recoverApiKeyById(id), bearer);
  assert.equal(await migrateLegacyApiKeyVaultRows(), 0);

  const row = db
    .prepare("SELECT key, key_ciphertext, key_hash, key_prefix FROM api_keys WHERE id = ?")
    .get(id) as { key: string; key_ciphertext: string; key_hash: string; key_prefix: string };
  assert.notEqual(row.key, bearer);
  assert.equal(row.key.includes("#vault:"), true);
  assert.equal(row.key_ciphertext.includes(bearer), false);
  assert.equal(row.key_hash, sha256(bearer));
  assert.equal(row.key_prefix, bearer.slice(0, 12));
});

test("legacy migration leaves malformed plaintext untouched", async () => {
  process.env.API_KEY_VAULT_SECRET = VALID_VAULT_SECRET;
  const db = getDbInstance();
  const bearer = "sk_legacy_bad_hash_0092";
  const id = "legacy-vault-bad-hash-0092";
  db.prepare(
    "INSERT INTO api_keys (id, name, key, machine_id, created_at, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, "legacy-bad", bearer, "machine-legacy", new Date().toISOString(), "0".repeat(64), bearer.slice(0, 12));

  await assert.rejects(() => recoverApiKeyById(id), /hash\/prefix verification/i);
  const row = db.prepare("SELECT key, key_ciphertext FROM api_keys WHERE id = ?").get(id) as {
    key: string;
    key_ciphertext: string | null;
  };
  assert.equal(row.key, bearer);
  assert.equal(row.key_ciphertext, null);
});


test("legacy plaintext is automatically vaulted on first API-key schema use", async () => {
  process.env.API_KEY_VAULT_SECRET = VALID_VAULT_SECRET;
  const db = getDbInstance();
  const bearer = "sk_legacy_auto_vault_0092";
  const id = "legacy-auto-vault-0092";
  db.prepare(
    "INSERT INTO api_keys (id, name, key, machine_id, created_at, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, "legacy-auto", bearer, "machine-legacy", new Date().toISOString(), sha256(bearer), bearer.slice(0, 12));

  resetApiKeyState();
  await getApiKeys();

  const row = db.prepare("SELECT key, key_ciphertext FROM api_keys WHERE id = ?").get(id) as {
    key: string;
    key_ciphertext: string | null;
  };
  assert.notEqual(row.key, bearer);
  assert.equal(row.key.includes("#vault:"), true);
  assert.ok(row.key_ciphertext);
  assert.equal(await recoverApiKeyById(id), bearer);
});

test("regenerate fails closed and preserves the old bearer when vault configuration is invalid", async () => {
  process.env.API_KEY_VAULT_SECRET = VALID_VAULT_SECRET;
  const created = await createApiKey("regen-fail-closed", "machine-regen-fail");
  const db = getDbInstance();
  const before = db.prepare("SELECT key, key_ciphertext, key_hash FROM api_keys WHERE id = ?").get(created.id);

  process.env.API_KEY_VAULT_SECRET = "malformed-vault-secret";
  await assert.rejects(() => regenerateApiKey(created.id), /vault secret/i);

  const after = db.prepare("SELECT key, key_ciphertext, key_hash FROM api_keys WHERE id = ?").get(created.id);
  assert.deepEqual(after, before);
  assert.equal(await validateApiKey(created.key), true);
});

test("wrong vault root fails recovery while hash auth survives, and restoring the root restores recovery", async () => {
  const original = Buffer.alloc(32, 21).toString("base64url");
  const wrong = Buffer.alloc(32, 22).toString("base64url");
  process.env.API_KEY_VAULT_SECRET = original;
  const created = await createApiKey("wrong-root-recovery", "machine-wrong-root");

  process.env.API_KEY_VAULT_SECRET = wrong;
  assert.equal(await validateApiKey(created.key), true);
  await assert.rejects(() => recoverApiKeyById(created.id), /authenticated/i);

  process.env.API_KEY_VAULT_SECRET = original;
  assert.equal(await recoverApiKeyById(created.id), created.key);
});

test("legacy migration can retry safely after a verification failure is corrected", async () => {
  process.env.API_KEY_VAULT_SECRET = VALID_VAULT_SECRET;
  const db = getDbInstance();
  const bearer = "sk_legacy_retry_vault_0092";
  const id = "legacy-retry-vault-0092";
  db.prepare(
    "INSERT INTO api_keys (id, name, key, machine_id, created_at, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, "legacy-retry", bearer, "machine-legacy", new Date().toISOString(), "f".repeat(64), bearer.slice(0, 12));

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    assert.equal(await migrateLegacyApiKeyVaultRows(), 0);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.some((warning) => warning.includes(id) && warning.includes("verification failed")), true);
  const failed = db.prepare("SELECT key, key_ciphertext FROM api_keys WHERE id = ?").get(id) as { key: string; key_ciphertext: string | null };
  assert.equal(failed.key, bearer);
  assert.equal(failed.key_ciphertext, null);

  db.prepare("UPDATE api_keys SET key_hash = ? WHERE id = ?").run(sha256(bearer), id);
  assert.equal(await migrateLegacyApiKeyVaultRows(), 1);
  assert.equal(await recoverApiKeyById(id), bearer);
});


test("legacy migration scrubs the exact bearer from live SQLite bytes and post-migration native backups", async () => {
  process.env.API_KEY_VAULT_SECRET = VALID_VAULT_SECRET;
  const db = getDbInstance();
  const bearer = "sk_legacy_physical_marker_0092_" + "Q".repeat(96);
  const id = "legacy-physical-vault-0092";
  db.prepare(
    "INSERT INTO api_keys (id, name, key, machine_id, created_at, key_hash, key_prefix) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, "legacy-physical", bearer, "machine-legacy", new Date().toISOString(), sha256(bearer), bearer.slice(0, 12));

  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  assert.ok(SQLITE_FILE);
  assert.equal(fs.readFileSync(SQLITE_FILE).includes(Buffer.from(bearer)), true, "fixture must begin with plaintext on disk");

  resetApiKeyState();
  await getApiKeys();
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");

  assert.equal(fs.readFileSync(SQLITE_FILE).includes(Buffer.from(bearer)), false);
  const backupPath = path.join(DATA_DIR, "legacy-vault-post-migration.sqlite");
  await db.backup(backupPath);
  assert.equal(fs.readFileSync(backupPath).includes(Buffer.from(bearer)), false);
});
