import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/usage/callLogs.ts"), "utf8");

test("TC-OMNIDB-LOG-037A: call-log save binds DB before any await", () => {
  const start = source.indexOf("async function saveCallLogOperation");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end > start ? end : undefined);
  const bind = body.indexOf("const db = getDbInstance()");
  const firstAwait = body.indexOf("await ");
  assert.ok(bind >= 0, "DB binding missing");
  assert.ok(firstAwait >= 0, "expected async work");
  assert.ok(bind < firstAwait, "DB must bind before the first await");
});

test("TC-OMNIDB-LOG-037B: call-log save does not reacquire DB after async artifact work", () => {
  const start = source.indexOf("async function saveCallLogOperation");
  const insert = source.indexOf("INSERT INTO call_logs", start);
  const body = source.slice(start, insert);
  const matches = body.match(/const db = getDbInstance\(\)/g) ?? [];
  assert.equal(matches.length, 1);
});
