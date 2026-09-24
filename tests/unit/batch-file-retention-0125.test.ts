import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const batches = fs.readFileSync(path.join(root, "src/lib/db/batches.ts"), "utf8");
const files = fs.readFileSync(path.join(root, "src/lib/db/files.ts"), "utf8");
const cleanup = fs.readFileSync(path.join(root, "src/lib/db/cleanup.ts"), "utf8");

test("TC-OMNIDB-BATCH-042A: terminal batch retention is bounded and age-gated", () => {
  assert.match(batches, /export function deleteTerminalBatchesOlderThan\(days: number\)/);
  assert.match(batches, /status IN \('completed', 'failed', 'cancelled', 'expired'\)/);
  assert.match(batches, /COALESCE\(completed_at, failed_at, cancelled_at, expired_at, created_at\) < \?/);
  assert.match(batches, /LIMIT \?/);
  assert.match(batches, /hasMore/);
});

test("TC-OMNIDB-BATCH-042B: expired file cleanup clears content without deleting metadata", () => {
  assert.match(files, /export function pruneExpiredFiles\(now: number\): number/);
  assert.match(
    files,
    /UPDATE files SET deleted_at = \?, content = NULL WHERE expires_at IS NOT NULL AND expires_at < \? AND deleted_at IS NULL/
  );
});

test("TC-OMNIDB-BATCH-042C: automatic batch/file cleanup is fail-closed and scheduled", () => {
  assert.match(cleanup, /BATCH_AND_FILE_AUTO_CLEANUP_ENABLED/);
  assert.match(cleanup, /process\.env\.BATCH_AND_FILE_AUTO_CLEANUP_ENABLED !== "true"/);
  assert.match(cleanup, /export async function cleanupOldBatches/);
  assert.match(cleanup, /export async function cleanupExpiredFiles/);
  assert.match(cleanup, /oldBatches: await cleanupOldBatches\(\)/);
  assert.match(cleanup, /expiredFiles: await cleanupExpiredFiles\(\)/);
});
