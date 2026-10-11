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
