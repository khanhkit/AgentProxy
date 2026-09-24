import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const classifier = fs.readFileSync(path.join(root, "open-sse/services/errorClassifier.ts"), "utf8");
const stats = fs.readFileSync(path.join(root, "src/lib/db/callLogStats.ts"), "utf8");
const format = fs.readFileSync(path.join(root, "src/lib/usage/callLogs/format.ts"), "utf8");
const logs = fs.readFileSync(path.join(root, "src/lib/usage/callLogs.ts"), "utf8");

test("TC-OMNIDB-ERRTYPE-054A: persisted error vocabulary is versioned and includes unknown", () => {
  assert.match(classifier, /export type ErrorTypeContract = ProviderErrorType \| "unknown"/);
  assert.match(classifier, /export const ERROR_TYPE_CONTRACT:/);
  assert.match(classifier, /export const ERROR_TYPE_CONTRACT_VERSION = 1/);
});

test("TC-OMNIDB-ERRTYPE-054B: analytics fail open unknown and out-of-contract stored values", () => {
  assert.match(stats, /ERROR_TYPE_CONTRACT/);
  assert.match(stats, /export const ERROR_TYPE_CUTOVER_ISO = "2026-08-20"/);
  assert.match(stats, /WHEN error_type NOT IN \(\$\{getErrorTypeVocabSql\(\)\}\) THEN 'unclassified'/);
});

test("TC-OMNIDB-ERRTYPE-054C: classifier and write boundary store explicit unknown for failures", () => {
  assert.match(format, /type ErrorTypeContract/);
  assert.match(format, /return classifyProviderError\(status, errorText, provider\) \?\? "unknown"/);
  assert.match(format, /export function toStoredErrorType\(value: unknown\): ErrorTypeContract \| null/);
  assert.match(format, /return parsed\.success \? parsed\.data : "unknown"/);
  assert.match(logs, /toStoredErrorType,/);
  assert.match(logs, /const errorType = toStoredErrorType\(/);
});
