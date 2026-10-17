import test from "node:test";
import assert from "node:assert/strict";

import { getDbInstance, resetDbInstance } from "@/lib/db/core";
import { reclaimFreedPages } from "@/lib/db/reclaimFreedPages";

test.afterEach(() => {
  resetDbInstance();
});

test("AP-ISS-0198: reclaim reports a closed handle instead of throwing before its loop", async () => {
  const db = getDbInstance();
  db.close();

  const result = await reclaimFreedPages();

  assert.equal(result.stopReason, "closed");
  assert.equal(result.batches, 0);
});
