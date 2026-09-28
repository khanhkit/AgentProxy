import test from "node:test";
import assert from "node:assert/strict";
import { createBunSqliteAdapter } from "../../src/lib/db/adapters/bunSqliteAdapter.ts";

function fakeDb(getResult: unknown) {
  return {
    query() {
      return {
        run() {
          return { changes: 0, lastInsertRowid: 0 };
        },
        get() {
          return getResult;
        },
        all() {
          return [];
        },
      };
    },
    exec() {},
    transaction<T>(fn: (...args: unknown[]) => T) {
      return Object.assign((...args: unknown[]) => fn(...args), { immediate: () => fn() });
    },
    close() {},
  };
}

test("TC-OMNIDB-ADAPTER-015: Bun adapter normalizes no-row null to undefined", () => {
  const adapter = createBunSqliteAdapter(fakeDb(null), ":memory:");
  assert.equal(adapter.prepare("SELECT 1 WHERE 0").get(), undefined);
});

test("TC-OMNIDB-ADAPTER-015B: Bun adapter preserves non-null row values", () => {
  const row = { id: 1 };
  const adapter = createBunSqliteAdapter(fakeDb(row), ":memory:");
  assert.equal(adapter.prepare("SELECT 1").get(), row);
});
