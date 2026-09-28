import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createFile, getFile } from "@/lib/db/files";
import { createBatch, deleteCompletedBatches, getBatch } from "@/lib/db/batches";
import { getDbInstance } from "@/lib/db/core";

const CLEANUP_PAGE_SIZE = 100;

function createOwnedFile(tag: string) {
  return createFile({
    bytes: 2,
    filename: `ap-iss-0102-${tag}.jsonl`,
    purpose: "batch",
    content: Buffer.from("{}"),
  });
}

describe("AP-ISS-0102 bounded reference-safe completed batch cleanup", () => {
  afterEach(() => {
    getDbInstance().exec("DROP TRIGGER IF EXISTS ap_iss_0102_fail_batch_delete");
  });

  it("preserves a file referenced by a surviving live batch", () => {
    const shared = createOwnedFile("shared-live");
    const completed = createBatch({
      endpoint: "/v1/chat/completions",
      completionWindow: "24h",
      inputFileId: shared.id,
      status: "completed",
    });
    const live = createBatch({
      endpoint: "/v1/chat/completions",
      completionWindow: "24h",
      inputFileId: shared.id,
      status: "in_progress",
    });

    const result = deleteCompletedBatches();

    assert.equal(getBatch(completed.id), null, "selected completed batch should be removed");
    assert.ok(getBatch(live.id), "live batch must survive cleanup");
    assert.ok(getFile(shared.id), "shared file must remain while a live batch references it");
    assert.equal(result.deletedFiles, 0, "a still-referenced file must not be counted as deleted");
  });

  it("preserves a file referenced by a completed batch outside the caller's owner scope", () => {
    const shared = createOwnedFile("shared-tenant");
    const owned = createBatch({
      endpoint: "/v1/chat/completions",
      completionWindow: "24h",
      inputFileId: shared.id,
      status: "completed",
      apiKeyId: "ap-iss-0102-owner-a",
    });
    const otherTenant = createBatch({
      endpoint: "/v1/chat/completions",
      completionWindow: "24h",
      inputFileId: shared.id,
      status: "completed",
      apiKeyId: "ap-iss-0102-owner-b",
    });

    const result = deleteCompletedBatches("ap-iss-0102-owner-a");

    assert.equal(getBatch(owned.id), null);
    assert.ok(getBatch(otherTenant.id), "out-of-scope tenant batch must survive");
    assert.ok(getFile(shared.id), "out-of-scope tenant reference must protect the shared file");
    assert.equal(result.deletedFiles, 0);
  });

  it("deletes at most one documented page and reports continuation", () => {
    const batches = Array.from({ length: CLEANUP_PAGE_SIZE + 5 }, (_, i) => {
      const file = createOwnedFile(`page-${i}`);
      return createBatch({
        endpoint: "/v1/chat/completions",
        completionWindow: "24h",
        inputFileId: file.id,
        status: "completed",
        apiKeyId: "ap-iss-0102-page-owner",
      });
    });

    const first = deleteCompletedBatches("ap-iss-0102-page-owner");

    assert.equal(first.deletedBatches, CLEANUP_PAGE_SIZE);
    assert.equal(first.hasMore, true, "caller must be told another cleanup page remains");
    assert.equal(
      batches.filter((batch) => getBatch(batch.id) !== null).length,
      5,
      "one invocation must leave work beyond the page budget for a later call"
    );

    const second = deleteCompletedBatches("ap-iss-0102-page-owner");
    assert.equal(second.deletedBatches, 5);
    assert.equal(second.hasMore, false);
  });

  it("the route exposes cleanup continuation state to callers", () => {
    const src = readFileSync(
      fileURLToPath(
        new URL("../../src/app/api/v1/batches/delete-completed/route.ts", import.meta.url)
      ),
      "utf8"
    );

    assert.match(src, /hasMore:\s*result\.hasMore/);
  });

  it("rolls back file deletion when deleting the selected batch rows fails", () => {
    const file = createOwnedFile("rollback");
    const batch = createBatch({
      endpoint: "/v1/chat/completions",
      completionWindow: "24h",
      inputFileId: file.id,
      status: "completed",
      apiKeyId: "ap-iss-0102-rollback-owner",
    });
    const db = getDbInstance();
    db.exec(`
      CREATE TRIGGER ap_iss_0102_fail_batch_delete
      BEFORE DELETE ON batches
      WHEN OLD.id = '${batch.id}'
      BEGIN
        SELECT RAISE(ABORT, 'ap-iss-0102 simulated batch delete failure');
      END;
    `);

    assert.throws(
      () => deleteCompletedBatches("ap-iss-0102-rollback-owner"),
      /ap-iss-0102 simulated batch delete failure/
    );

    assert.ok(getBatch(batch.id), "failed DB deletion must leave the batch row intact");
    assert.ok(getFile(file.id), "rollback must preserve the file referenced by the surviving row");
  });
});
