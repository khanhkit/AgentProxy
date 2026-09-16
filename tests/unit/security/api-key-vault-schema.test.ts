import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-api-key-vault-schema-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../../src/lib/db/core.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("fresh api_keys schema includes nullable key_ciphertext without a backup-producing migration", () => {
  const db = core.getDbInstance();
  const columns = db.prepare("PRAGMA table_info(api_keys)").all() as Array<{ name: string; notnull: number }>;
  const ciphertext = columns.find((column) => column.name === "key_ciphertext");
  assert.ok(ciphertext, "fresh schema must include key_ciphertext");
  assert.equal(ciphertext.notnull, 0);
});
