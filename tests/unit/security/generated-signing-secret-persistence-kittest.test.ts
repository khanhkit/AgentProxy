import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { DATA_DIR, DB_BACKUPS_DIR, getDbInstance } from "../../../src/lib/db/core.ts";
import { restoreDbBackup } from "../../../src/lib/db/backup.ts";
import { getPersistedSecret, persistSecret } from "../../../src/lib/db/secrets.ts";

function fixture(label: string) {
  const suffix = randomUUID();
  return {
    key: `kittest-${label}-${suffix}`,
    secret: `kittest-signing-secret-${suffix}-${randomUUID()}-${randomUUID()}`,
  };
}

function secretFilePath(key: string): string {
  const digest = createHash("sha256").update(key).digest("hex");
  return path.join(DATA_DIR, "secrets", `${digest}.secret`);
}

function deleteSecret(key: string): void {
  getDbInstance()
    .prepare("DELETE FROM key_value WHERE namespace = 'secrets' AND key = ?")
    .run(key);
  fs.rmSync(secretFilePath(key), { force: true });
}

test("TC-SECRET-SEC-001 persisted signing-secret representation excludes reusable raw secret", () => {
  const { key, secret } = fixture("persisted");
  try {
    persistSecret(key, secret);
    const row = getDbInstance()
      .prepare("SELECT value FROM key_value WHERE namespace = 'secrets' AND key = ?")
      .get(key) as { value?: string } | undefined;

    assert.ok(row, "persisted secret fixture must exist before confidentiality inspection");
    assert.equal(
      row.value?.includes(secret),
      false,
      "ordinary persisted representation must not contain the exact reusable signing secret"
    );
  } finally {
    deleteSecret(key);
  }
});

test("TC-SECRET-SEC-002 full SQLite backup artifact excludes reusable raw signing secret", async () => {
  const { key, secret } = fixture("backup");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-kittest-secret-backup-"));
  const backupPath = path.join(tempDir, "storage.sqlite");

  try {
    persistSecret(key, secret);
    await getDbInstance().backup(backupPath);

    const artifact = fs.readFileSync(backupPath);
    assert.equal(
      artifact.includes(Buffer.from(secret, "utf8")),
      false,
      "native/full database backup must not contain the exact reusable signing secret"
    );
  } finally {
    deleteSecret(key);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("TC-SECRET-SEC-003 same-host DB restore preserves protected signing identity without embedding it in backup", async () => {
  const { key, secret } = fixture("restore");
  const backupDir = DB_BACKUPS_DIR ?? path.join(DATA_DIR, "db_backups");
  const backupId = `db_${Date.now()}_kittest-secret-restore.sqlite`;
  const backupPath = path.join(backupDir, backupId);
  const probeKey = `kittest-restore-probe-${randomUUID()}`;

  fs.mkdirSync(backupDir, { recursive: true });

  try {
    persistSecret(key, secret);
    assert.equal(getPersistedSecret(key), secret, "protected signing secret must be usable before backup");

    const db = getDbInstance();
    db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES (?, ?, ?)").run(
      "kittest",
      probeKey,
      JSON.stringify("before-backup")
    );
    await db.backup(backupPath);

    const artifact = fs.readFileSync(backupPath);
    assert.equal(
      artifact.includes(Buffer.from(secret, "utf8")),
      false,
      "supported same-host DB backup must not embed the reusable signing secret"
    );

    db.prepare("UPDATE key_value SET value = ? WHERE namespace = ? AND key = ?").run(
      JSON.stringify("after-backup"),
      "kittest",
      probeKey
    );

    const restoreResult = await restoreDbBackup(backupId);
    assert.equal(restoreResult.restored, true, "supported restore operation must complete");

    const restoredProbe = getDbInstance()
      .prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?")
      .get("kittest", probeKey) as { value?: string } | undefined;
    assert.equal(
      restoredProbe?.value,
      JSON.stringify("before-backup"),
      "test must prove the SQLite backup was actually restored"
    );
    assert.equal(
      getPersistedSecret(key),
      secret,
      "same-host restore must continue using protected sidecar signing material"
    );
  } finally {
    deleteSecret(key);
    getDbInstance().prepare("DELETE FROM key_value WHERE namespace = ? AND key = ?").run("kittest", probeKey);
    fs.rmSync(backupPath, { force: true });
  }
});
