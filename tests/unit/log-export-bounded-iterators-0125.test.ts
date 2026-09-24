import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const proxyLogs = fs.readFileSync(path.join(root, "src/lib/db/proxyLogs.ts"), "utf8");
const callLogs = fs.readFileSync(path.join(root, "src/lib/usage/callLogs.ts"), "utf8");

test("TC-OMNIDB-EXPORT-049A: proxy log export exposes cheap count and bounded keyset iterator", () => {
  assert.match(proxyLogs, /export function countProxyLogsSince\(since: string\): number/);
  assert.match(proxyLogs, /SELECT COUNT\(\*\) AS count FROM proxy_logs WHERE timestamp >= @since/);
  assert.match(proxyLogs, /export function\* iterateProxyLogsSince\(/);
  assert.match(proxyLogs, /getLegacyProxyLogExportMaxRowId\(since\)/);
  assert.match(proxyLogs, /getLegacyProxyLogExportPage\(since, maxRowId, cursor, pageLimit\)/);
});

test("TC-OMNIDB-EXPORT-049B: call log export exposes cheap count and bounded hydrated iterator", () => {
  assert.match(callLogs, /export function countCallLogsSince\(since: string\): number/);
  assert.match(callLogs, /SELECT COUNT\(\*\) AS count FROM call_logs WHERE timestamp >= \?/);
  assert.match(callLogs, /export async function\* iterateCallLogsSince\(/);
  assert.match(callLogs, /getLegacyCallLogExportMaxRowId\(since\)/);
  assert.match(callLogs, /getLegacyCallLogExportIdPage\(since, maxRowId, cursor, pageLimit\)/);
  assert.match(callLogs, /const log = await getCallLogById\(row\.id\)/);
});
