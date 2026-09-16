import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { DATA_DIR } from "./core";
import {
  repairOwnerOnlyFileSync,
  writeOwnerOnlyFileSync,
} from "../security/ownerOnlyFile";

const VAULT_VERSION = "v1";
const VAULT_SECRET_ENV = "API_KEY_VAULT_SECRET";
const VAULT_SECRET_DIR = path.join(DATA_DIR, "secrets");
const VAULT_SECRET_PATH = path.join(VAULT_SECRET_DIR, "api-key-vault-v1.secret");
const VAULT_AAD_PREFIX = "agentproxy-api-key-vault-v1:";

export class ApiKeyVaultError extends Error {
  readonly code = "API_KEY_VAULT_UNAVAILABLE";
}

function decodeRootSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  if (!trimmed) throw new ApiKeyVaultError("API key vault secret is empty");
  let decoded: Buffer;
  try {
    decoded = Buffer.from(trimmed, "base64url");
  } catch {
    throw new ApiKeyVaultError("API key vault secret is not valid base64url");
  }
  if (decoded.length !== 32 || decoded.toString("base64url") !== trimmed.replace(/=+$/u, "")) {
    throw new ApiKeyVaultError("API key vault secret must encode exactly 32 bytes");
  }
  return decoded;
}

function ensureSecretDir(): void {
  fs.mkdirSync(VAULT_SECRET_DIR, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") fs.chmodSync(VAULT_SECRET_DIR, 0o700);
}

function loadOrCreateSidecarSecret(): string {
  ensureSecretDir();
  if (fs.existsSync(VAULT_SECRET_PATH)) {
    repairOwnerOnlyFileSync(VAULT_SECRET_PATH);
    return fs.readFileSync(VAULT_SECRET_PATH, "utf8").trim();
  }

  const generated = crypto.randomBytes(32).toString("base64url");
  try {
    writeOwnerOnlyFileSync(VAULT_SECRET_PATH, generated, { encoding: "utf8" });
  } catch (error) {
    throw new ApiKeyVaultError(
      `Failed to persist API key vault secret: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const roundTrip = fs.readFileSync(VAULT_SECRET_PATH, "utf8").trim();
  if (roundTrip !== generated) {
    throw new ApiKeyVaultError("API key vault secret persistence verification failed");
  }
  return roundTrip;
}

function getRootKey(): Buffer {
  const envSecret = process.env[VAULT_SECRET_ENV];
  return decodeRootSecret(envSecret?.trim() ? envSecret : loadOrCreateSidecarSecret());
}

function aadForId(id: string): Buffer {
  return Buffer.from(`${VAULT_AAD_PREFIX}${id}`, "utf8");
}

export function encryptApiKeyBearer(id: string, bearer: string): string {
  if (!id || !bearer) throw new ApiKeyVaultError("API key vault encryption requires id and bearer");
  const key = getRootKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aadForId(id));
  const ciphertext = Buffer.concat([cipher.update(bearer, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VAULT_VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(":");
}

export function decryptApiKeyBearer(id: string, payload: string): string {
  const [version, ivText, ciphertextText, tagText, extra] = payload.split(":");
  if (version !== VAULT_VERSION || !ivText || !ciphertextText || !tagText || extra !== undefined) {
    throw new ApiKeyVaultError("API key vault ciphertext format is invalid");
  }
  try {
    const key = getRootKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
    decipher.setAAD(aadForId(id));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof ApiKeyVaultError) throw error;
    throw new ApiKeyVaultError("API key vault ciphertext could not be authenticated");
  }
}

export function buildApiKeyStorageSentinel(bearer: string, hash: string): string {
  return `${bearer.slice(0, 8)}#vault:${hash}#${bearer.slice(-4)}`;
}

export function isApiKeyStorageSentinel(value: unknown): boolean {
  return typeof value === "string" && value.includes("#vault:");
}

export function getApiKeyVaultSecretPathForTests(): string {
  return VAULT_SECRET_PATH;
}
