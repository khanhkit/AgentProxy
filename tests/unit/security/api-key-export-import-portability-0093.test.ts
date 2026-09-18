import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

const TEST_DATA_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "agentproxy-api-key-portability-0093-")
);
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_VAULT_SECRET = process.env.API_KEY_VAULT_SECRET;
const ORIGINAL_API_KEY_SECRET = process.env.API_KEY_SECRET;
const VALID_VAULT_SECRET = Buffer.alloc(32, 93).toString("base64url");
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_VAULT_SECRET = VALID_VAULT_SECRET;
process.env.API_KEY_SECRET = "ap-iss-0093-test-crc-secret";

const core = await import("../../../src/lib/db/core.ts");
const apiKeysDb = await import("../../../src/lib/db/apiKeys.ts");
const apiKeyVault = await import("../../../src/lib/db/apiKeyVault.ts");
const { runJsonMigration } = await import("../../../src/lib/db/jsonMigration.ts");
const exportRoute = await import("../../../src/app/api/settings/export-json/route.ts");
const fullBackupRoute = await import("../../../src/app/api/db-backups/exportAll/route.ts");
await apiKeysDb.getApiKeys();

test.beforeEach(() => {
  process.env.API_KEY_VAULT_SECRET = VALID_VAULT_SECRET;
  core.getDbInstance().prepare("DELETE FROM api_keys").run();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  if (ORIGINAL_VAULT_SECRET === undefined) delete process.env.API_KEY_VAULT_SECRET;
  else process.env.API_KEY_VAULT_SECRET = ORIGINAL_VAULT_SECRET;
  if (ORIGINAL_API_KEY_SECRET === undefined) delete process.env.API_KEY_SECRET;
  else process.env.API_KEY_SECRET = ORIGINAL_API_KEY_SECRET;
});

test("AP-ISS-0093 legacy JSON export contains metadata only, never bearer or ciphertext", async () => {
  const created = await apiKeysDb.createApiKey("portable-redaction", "0011223344556677", [
    "manage",
  ]);
  const row = core
    .getDbInstance()
    .prepare("SELECT key_ciphertext FROM api_keys WHERE id = ?")
    .get(created.id) as { key_ciphertext: string };

  const exported = {
    apiKeys: exportRoute.redactApiKeysForLegacyExport(
      (await apiKeysDb.getApiKeys()) as Array<Record<string, unknown>>
    ),
    _meta: { apiKeyCredentialPolicy: "redacted-non-restorable" },
  };
  const body = JSON.stringify(exported);

  assert.equal(body.includes(created.key), false, "raw bearer must not appear in portable JSON");
  assert.equal(
    body.includes(row.key_ciphertext),
    false,
    "vault ciphertext must not appear in portable JSON"
  );
  assert.equal(
    body.includes(VALID_VAULT_SECRET),
    false,
    "vault root secret must not appear in portable JSON"
  );
  assert.equal(exported._meta?.apiKeyCredentialPolicy, "redacted-non-restorable");
  assert.ok(Array.isArray(exported.apiKeys));
  assert.equal(exported.apiKeys?.length, 1);
  assert.equal(exported.apiKeys?.[0]?.credentialState, "redacted-non-restorable");
  assert.equal(Object.hasOwn(exported.apiKeys?.[0] ?? {}, "key"), false);
  assert.equal(Object.hasOwn(exported.apiKeys?.[0] ?? {}, "keyCiphertext"), false);
});

test("AP-ISS-0093 importing a new redacted export does not create credential authority", async () => {
  await apiKeysDb.createApiKey("redacted-roundtrip", "8899aabbccddeeff", ["manage"]);
  const exported = {
    apiKeys: exportRoute.redactApiKeysForLegacyExport(
      (await apiKeysDb.getApiKeys()) as Array<Record<string, unknown>>
    ),
  };

  const db = core.getDbInstance();
  db.prepare("DELETE FROM api_keys").run();
  const counts = runJsonMigration(db, exported);

  assert.equal(counts.apiKeys, 0);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM api_keys").get().count, 0);
});

test("AP-ISS-0093 historical raw-key import encrypts before durable persistence", async () => {
  const bearer = "sk-historical-0093-raw-bearer-marker";
  const id = "historical-api-key-0093";
  const db = core.getDbInstance();

  const counts = runJsonMigration(db, {
    apiKeys: [
      {
        id,
        name: "historical-import",
        key: bearer,
        machineId: "0011223344556677",
        modelAccessMode: "all",
        allowedModels: [],
        noLog: false,
        createdAt: "2026-09-18T00:00:00.000Z",
      },
    ],
  });

  assert.equal(counts.apiKeys, 1);
  const row = db
    .prepare("SELECT key, key_ciphertext, key_hash, key_prefix FROM api_keys WHERE id = ?")
    .get(id) as {
    key: string;
    key_ciphertext: string | null;
    key_hash: string | null;
    key_prefix: string | null;
  };
  assert.ok(row);
  assert.notEqual(row.key, bearer);
  assert.match(row.key, /#vault:/);
  assert.ok(row.key_ciphertext);
  assert.equal(row.key_ciphertext?.includes(bearer), false);
  assert.equal(row.key_prefix, bearer.slice(0, 12));
  assert.ok(row.key_hash);
  assert.equal(await apiKeysDb.recoverApiKeyById(id), bearer);
  assert.ok(await apiKeysDb.validateApiKey(bearer));
});

test("AP-ISS-0093 full-backup metadata makes external vault recovery semantics explicit", () => {
  const metadata = fullBackupRoute.buildFullBackupMetadata(
    "2026-09-18T00:00:00.000Z",
    "test-version"
  );
  assert.equal(metadata.apiKeyRecovery.databaseMaterial, "hash-and-ciphertext-only");
  assert.equal(metadata.apiKeyRecovery.vaultKeyIncluded, false);
  assert.equal(
    metadata.apiKeyRecovery.withMatchingVaultKey,
    "authentication-and-recovery-available"
  );
  assert.equal(
    metadata.apiKeyRecovery.withoutMatchingVaultKey,
    "hash-authentication-only-recovery-unavailable"
  );
  assert.equal(metadata.apiKeyRecovery.portableJsonPolicy, "redacted-non-restorable");
});

test("AP-ISS-0093 full SQLite backup preserves hash/ciphertext but excludes bearer and vault root key", async () => {
  const created = await apiKeysDb.createApiKey("full-backup", "0123456789abcdef", ["manage"]);
  const backupPath = path.join(TEST_DATA_DIR, "ap-iss-0093-full-backup.sqlite");
  await core.getDbInstance().backup(backupPath);

  const bytes = fs.readFileSync(backupPath);
  assert.equal(
    bytes.includes(Buffer.from(created.key)),
    false,
    "full DB backup must not contain plaintext bearer"
  );
  assert.equal(
    bytes.includes(Buffer.from(VALID_VAULT_SECRET)),
    false,
    "full DB backup must not contain vault root secret"
  );

  const restored = new Database(backupPath, { readonly: true });
  try {
    const row = restored
      .prepare("SELECT id, key, key_ciphertext, key_hash, key_prefix FROM api_keys WHERE id = ?")
      .get(created.id) as {
      id: string;
      key: string;
      key_ciphertext: string;
      key_hash: string;
      key_prefix: string;
    };
    assert.match(row.key, /#vault:/);
    assert.ok(row.key_ciphertext);
    assert.equal(row.key_hash, createHash("sha256").update(created.key).digest("hex"));
    assert.equal(row.key_prefix, created.key.slice(0, 12));

    process.env.API_KEY_VAULT_SECRET = VALID_VAULT_SECRET;
    assert.equal(apiKeyVault.decryptApiKeyBearer(row.id, row.key_ciphertext), created.key);

    process.env.API_KEY_VAULT_SECRET = Buffer.alloc(32, 94).toString("base64url");
    assert.throws(
      () => apiKeyVault.decryptApiKeyBearer(row.id, row.key_ciphertext),
      /vault ciphertext could not be authenticated/i
    );
    const knownBearerAuth = restored
      .prepare("SELECT id FROM api_keys WHERE key_hash = ?")
      .get(createHash("sha256").update(created.key).digest("hex")) as { id: string } | undefined;
    assert.equal(
      knownBearerAuth?.id,
      created.id,
      "hash authentication state survives without recovery key"
    );
  } finally {
    restored.close();
  }
});

test("AP-ISS-0093 historical credential import fails closed when vault secret is invalid", () => {
  const db = core.getDbInstance();
  process.env.API_KEY_VAULT_SECRET = "invalid-vault-secret";

  assert.throws(
    () =>
      runJsonMigration(db, {
        settings: { importedBeforeCredentialFailure: true },
        apiKeys: [
          {
            id: "historical-invalid-vault-0093",
            name: "must-fail",
            key: "sk-historical-0093-invalid-vault",
            machineId: "0011223344556677",
          },
        ],
      }),
    /vault secret|32 bytes|API key vault/i
  );

  assert.equal(db.prepare("SELECT COUNT(*) count FROM api_keys").get().count, 0);
  assert.equal(
    db
      .prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?")
      .get("settings", "importedBeforeCredentialFailure"),
    undefined,
    "transaction must roll back non-credential writes too"
  );
});
