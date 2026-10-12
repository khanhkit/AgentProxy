import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scriptPath = new URL("../../../scripts/dev/run-standalone.mjs", import.meta.url);
const source = readFileSync(scriptPath, "utf8");

test("standalone parent escalation outlives the child lifecycle deadline", () => {
  assert.match(
    source,
    /const DEFAULT_APP_SHUTDOWN_TIMEOUT_MS\s*=\s*30_000/,
    "standalone launcher should share the app lifecycle default budget"
  );
  assert.match(
    source,
    /const SHUTDOWN_EXIT_MARGIN_MS\s*=\s*1_000/,
    "parent escalation must leave a bounded margin after the app deadline"
  );
  assert.match(
    source,
    /graceMs\s*=\s*resolveShutdownEscalationTimeoutMs\(childEnv\)/,
    "stopNext must not SIGKILL the child before its lifecycle deadline expires"
  );
});

test("standalone parent strictly parses the lifecycle timeout", () => {
  assert.match(source, /const parsed = Number\(runtimeEnv\.SHUTDOWN_TIMEOUT_MS/);
  assert.doesNotMatch(source, /Number\.parseInt\([\s\S]*?SHUTDOWN_TIMEOUT_MS/);
});

test("packaged standalone hard deadline leaves cleanup margin", () => {
  const packaged = readFileSync(
    new URL("../../../scripts/dev/standalone-server-ws.mjs", import.meta.url),
    "utf8"
  );
  assert.match(packaged, /const SHUTDOWN_EXIT_MARGIN_MS\s*=\s*1_000/);
  assert.match(packaged, /STANDALONE_SHUTDOWN_TIMEOUT_MS\s*\+\s*SHUTDOWN_EXIT_MARGIN_MS/);
});

test("standalone parent adds signal-delivery margin beyond child hard deadline", () => {
  assert.match(source, /const PARENT_SIGNAL_DELIVERY_MARGIN_MS\s*=\s*1_000/);
  assert.match(
    source,
    /graceMs\s*=\s*resolveShutdownEscalationTimeoutMs\(childEnv\)\s*\+\s*PARENT_SIGNAL_DELIVERY_MARGIN_MS/
  );
});
