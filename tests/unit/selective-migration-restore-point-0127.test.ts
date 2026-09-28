import assert from "node:assert/strict";
import test from "node:test";

import { awaitStableRestorePoint } from "../../src/lib/migration/selectiveRestorePoint.ts";

test("TC-MIG-RESTORE-028 waits for the manual backup to reach stable expected size", async () => {
  let listCalls = 0;
  const result = await awaitStableRestorePoint({
    createBackup: () => ({ filename: "db_fixture_manual.sqlite", size: 8192 }),
    listBackups: async () => {
      listCalls += 1;
      if (listCalls === 1) return [];
      return [{ id: "db_fixture_manual.sqlite", filename: "db_fixture_manual.sqlite", size: 8192 }];
    },
    sleep: async () => {},
    maxAttempts: 5,
  });

  assert.equal(result.id, "db_fixture_manual.sqlite");
  assert.ok(listCalls >= 3);
});

test("TC-MIG-RESTORE-029 refuses to continue when backup creation is unavailable", async () => {
  await assert.rejects(
    () =>
      awaitStableRestorePoint({
        createBackup: () => null,
        listBackups: async () => [],
        sleep: async () => {},
      }),
    /restore point.*not created/i
  );
});

test("TC-MIG-RESTORE-030 fails closed when backup never becomes stable", async () => {
  let listCalls = 0;
  await assert.rejects(
    () =>
      awaitStableRestorePoint({
        createBackup: () => ({ filename: "db_fixture_manual.sqlite", size: 8192 }),
        listBackups: async () => {
          listCalls += 1;
          return [{ id: "db_fixture_manual.sqlite", filename: "db_fixture_manual.sqlite", size: 4096 }];
        },
        sleep: async () => {},
        maxAttempts: 3,
      }),
    /did not become ready/i
  );
  assert.equal(listCalls, 3);
});
