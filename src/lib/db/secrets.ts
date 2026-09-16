import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { DATA_DIR, getDbInstance } from "./core";

interface SecretRow {
  value?: string;
}

const SECRET_STORAGE_VERSION = "owner-file-v1";
const SECRET_STORAGE_MARKER = JSON.stringify({ storage: SECRET_STORAGE_VERSION });
const SECRET_STORAGE_DIR = path.join(DATA_DIR, "secrets");

function secretFilePath(key: string): string {
  const digest = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(SECRET_STORAGE_DIR, `${digest}.secret`);
}

function ensureSecretStorageDir(): void {
  fs.mkdirSync(SECRET_STORAGE_DIR, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(SECRET_STORAGE_DIR, 0o700);
  } catch {
    // Best effort on filesystems/platforms that do not implement POSIX modes.
  }
}

function readSecretFile(key: string): string | null {
  try {
    return fs.readFileSync(secretFilePath(key), "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    return null;
  }
}

function persistSecretFile(key: string, value: string): boolean {
  try {
    ensureSecretStorageDir();
    const filePath = secretFilePath(key);
    try {
      fs.writeFileSync(filePath, value, { encoding: "utf8", mode: 0o600, flag: "wx" });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") throw error;
    }
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Best effort on filesystems/platforms that do not implement POSIX modes.
    }
    return true;
  } catch {
    return false;
  }
}

function readPersistedRow(key: string): SecretRow | undefined {
  const db = getDbInstance();
  return db
    .prepare("SELECT value FROM key_value WHERE namespace = 'secrets' AND key = ?")
    .get(key) as SecretRow | undefined;
}

function markSecretAsProtected(key: string): boolean {
  try {
    const db = getDbInstance();
    const result = db
      .prepare("UPDATE key_value SET value = ? WHERE namespace = 'secrets' AND key = ?")
      .run(SECRET_STORAGE_MARKER, key);
    return result.changes === 1;
  } catch {
    return false;
  }
}

export function getPersistedSecret(key: string): string | null {
  const protectedValue = readSecretFile(key);
  if (protectedValue !== null) return protectedValue;

  try {
    const row = readPersistedRow(key);
    if (typeof row?.value !== "string") return null;

    const parsed = JSON.parse(row.value) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      (parsed as { storage?: unknown }).storage === SECRET_STORAGE_VERSION
    ) {
      return null;
    }

    if (typeof parsed !== "string") return null;

    // One-time migration for legacy plaintext key_value rows. The secret becomes
    // an owner-only sidecar file while the database retains only a non-secret marker.
    if (!persistSecretFile(key, parsed)) return null;
    if (!markSecretAsProtected(key)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistSecret(key: string, value: string): void {
  try {
    // Preserve historical insert-only semantics. getPersistedSecret() also
    // migrates any legacy plaintext row before this check returns.
    if (getPersistedSecret(key) !== null) return;
    if (!persistSecretFile(key, value)) return;

    const db = getDbInstance();
    db.prepare(
      "INSERT OR IGNORE INTO key_value (namespace, key, value) VALUES ('secrets', ?, ?)"
    ).run(key, SECRET_STORAGE_MARKER);
  } catch {
    // Non-fatal: secrets still work for the current process if persistence fails.
  }
}
