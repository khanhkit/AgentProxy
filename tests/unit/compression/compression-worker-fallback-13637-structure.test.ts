import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const pool = fs.readFileSync(
  path.join(process.cwd(), "open-sse/services/compression/compressionWorkerPool.ts"),
  "utf8"
);
const selector = fs.readFileSync(
  path.join(process.cwd(), "open-sse/services/compression/strategySelector.ts"),
  "utf8"
);

test("worker faults carry an explicit in-process retry policy", () => {
  assert.match(pool, /export class CompressionWorkerError extends Error/);
  assert.match(pool, /readonly retryInProcess: boolean/);
  assert.match(pool, /return new Promise\(\(resolve, reject\) =>/);
  assert.match(pool, /reject: \(error: Error\) => void/);
});

test("dispatch timeout is non-retryable while fast worker faults are retryable", () => {
  assert.match(pool, /compression worker timed out after[\s\S]{0,100}false/);
  assert.match(pool, /compression worker thread error:/);
  assert.match(pool, /compression worker exited/);
  assert.match(pool, /compression worker error:[\s\S]{0,80}true/);
});

test("worker rejection is reported instead of resolving unchanged", () => {
  assert.match(pool, /private abort\(slot: PoolWorker, error: CompressionWorkerError\)/);
  assert.match(pool, /if \(job\) job\.reject\(error\)/);
  assert.doesNotMatch(pool, /if \(job\) job\.resolve\(unchanged\(job\.originalBody\)\)/);
});

test("strategy retries fast worker faults in-process but not timeouts", () => {
  assert.match(selector, /catch \(workerError\)/);
  assert.match(selector, /retryInProcess !== false/);
  assert.match(selector, /logCompressionWorkerFault\(workerError, retryInProcess\)/);
  assert.match(selector, /if \(!retryInProcess\) return \{ body, compressed: false, stats: null \}/);
});
