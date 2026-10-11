import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(here, "../../scripts/dev/standalone-server-ws.mjs"),
  "utf8"
);

const importServerIndex = source.indexOf('await import("./server.js")');

test("packaged standalone establishes one signal owner before Next starts", () => {
  assert.ok(importServerIndex > 0, "expected standalone wrapper to import server.js");
  const bootstrap = source.slice(0, importServerIndex);

  assert.match(
    bootstrap,
    /process\.env\.NEXT_MANUAL_SIG_HANDLE\s*=\s*["']1["']/,
    "Next must not install its competing SIGINT/SIGTERM final-exit owner"
  );
  assert.match(
    bootstrap,
    /globalThis\.__agentproxyCustomServerOwnsShutdown\s*=\s*true/,
    "instrumentation must publish cleanup without installing a second signal owner"
  );
});

test("packaged standalone owner stops admission then awaits AgentProxy lifecycle before exit", () => {
  assert.match(source, /server\.close\(/, "standalone owner must stop new HTTP admission");
  assert.match(
    source,
    /server\.closeIdleConnections\?\.\(\)/,
    "standalone owner must close idle keep-alive admission during shutdown"
  );
  assert.match(
    source,
    /await\s+globalThis\.__agentproxyRequestShutdown\?\.\(signal\)/,
    "standalone owner must await the lifecycle that flushes durable state and closes the DB"
  );
  assert.match(
    source,
    /server\.closeAllConnections\?\.\(\)/,
    "standalone owner must terminate transport only after application drain/flush"
  );
});

test("packaged standalone shutdown is idempotent across duplicate group/parent signals and owns SIGHUP", () => {
  assert.match(
    source,
    /if\s*\(standaloneShuttingDown\)\s*return/,
    "duplicate SIGTERM from the process group and supervisor must not force-exit mid-flush"
  );
  assert.match(
    source,
    /for\s*\(const signal of \["SIGINT", "SIGTERM", "SIGHUP"\]\)/,
    "standalone owner must enumerate SIGINT/SIGTERM/SIGHUP"
  );
  assert.match(
    source,
    /process\.on\(signal,\s*\(\) => void shutdownStandalone\(signal\)\)/,
    "all supported signals must route to the same standalone lifecycle owner"
  );
});
