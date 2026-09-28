import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const batches = fs.readFileSync(path.join(root, "src/lib/db/batches.ts"), "utf8");
const files = fs.readFileSync(path.join(root, "src/lib/db/files.ts"), "utf8");

test("TC-OMNIDB-BATCH-043A: files expose owner-scoped soft delete", () => {
  assert.match(files, /export function deleteFileOwnedBy\(id: string, apiKeyId: string\): boolean/);
  assert.match(files, /WHERE id = \? AND api_key_id = \?/);
  assert.match(files, /apiKeyId\.trim\(\) === ""/);
});

test("TC-OMNIDB-BATCH-043B: key-scoped completed sweep never uses unconditional file delete", () => {
  assert.match(batches, /import \{ deleteFile, deleteFileOwnedBy \} from "\.\/files"/);
  assert.match(
    batches,
    /const removed = scoped \? deleteFileOwnedBy\(fileId, apiKeyId as string\) : deleteFile\(fileId\)/
  );
});
