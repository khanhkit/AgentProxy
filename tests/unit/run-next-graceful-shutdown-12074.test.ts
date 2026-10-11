import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const runNextSource = readFileSync(join(process.cwd(), "scripts/dev/run-next.mjs"), "utf8");

test("the custom Next runner owns signals and orders application lifecycle before transport/child teardown", () => {
  const ownerRegistration = runNextSource.indexOf(
    "globalThis.__agentproxyCustomServerOwnsShutdown = true"
  );
  const prepareCall = runNextSource.indexOf("await prepareWithHeal()");
  assert.ok(ownerRegistration >= 0, "custom server shutdown ownership must be registered");
  assert.ok(ownerRegistration < prepareCall, "shutdown ownership must exist before instrumentation");

  const serverClose = runNextSource.indexOf("server.close(");
  const applicationCleanup = runNextSource.indexOf(
    "await globalThis.__agentproxyRequestShutdown?.(signal)"
  );
  const closeIdle = runNextSource.indexOf("server.closeIdleConnections?.()", applicationCleanup);
  const closeAll = runNextSource.indexOf("server.closeAllConnections?.()", applicationCleanup);
  const awaitServerClose = runNextSource.indexOf("await serverClosePromise", applicationCleanup);
  const nextClose = runNextSource.indexOf("await nextApp.close()", applicationCleanup);
  const rustStop = runNextSource.indexOf("await stopRustCore", applicationCleanup);
  const processExit = runNextSource.indexOf("process.exit(exitCode)", rustStop);

  assert.ok(serverClose >= 0 && serverClose < applicationCleanup, "server.close must stop new TCP admission first");
  assert.ok(closeIdle < applicationCleanup, "idle keep-alive cleanup must happen at admission stop");
  assert.ok(applicationCleanup < closeAll, "active transport cleanup must wait for application drain");
  assert.ok(closeAll < awaitServerClose, "force-close remaining sockets before awaiting server close completion");
  assert.ok(awaitServerClose < nextClose, "HTTP server must be closed before Next teardown");
  assert.ok(nextClose < rustStop, "Rust child must stop only after application/Next cleanup");
  assert.ok(rustStop < processExit, "process exit must remain the final shutdown action");
});

test("custom Next runner uses the configured global shutdown budget and preserves force-exit semantics", () => {
  assert.match(
    runNextSource,
    /const\s+parsedShutdownTimeoutMs\s*=\s*Number\.parseInt\(process\.env\.SHUTDOWN_TIMEOUT_MS[\s\S]*?const\s+SHUTDOWN_TIMEOUT_MS/,
    "custom runner must derive its force-exit budget from SHUTDOWN_TIMEOUT_MS"
  );
  assert.match(
    runNextSource,
    /setTimeout\([\s\S]*?,\s*SHUTDOWN_TIMEOUT_MS\s*\)/,
    "force-exit timer must use the same configured shutdown budget"
  );
  assert.match(
    runNextSource,
    /if\s*\(\s*shuttingDown\s*\)\s*\{[\s\S]*?process\.exit\(1\);?\s*\}/,
    "second signal / Ctrl+C must immediately exit"
  );
  assert.match(
    runNextSource,
    /process\.on\(\"SIGHUP\",\s*\(\)\s*=>\s*void shutdown\(\"SIGHUP\"\)\)/,
    "custom server must route SIGHUP through the same lifecycle owner"
  );
  assert.match(
    runNextSource,
    /lifecycleReport\?\.clean\s*===\s*false[\s\S]*?exitCode\s*=\s*exitCode\s*\|\|\s*1/,
    "a non-clean application lifecycle report must produce a non-zero exit"
  );
});

test("custom Next runner rejects HTTP close errors and closes idle sockets at admission stop", () => {
  const serverClose = runNextSource.indexOf("server.close(");
  const closeIdle = runNextSource.indexOf("server.closeIdleConnections?.()");
  const applicationCleanup = runNextSource.indexOf(
    "await globalThis.__agentproxyRequestShutdown?.(signal)"
  );

  assert.match(
    runNextSource,
    /new Promise\(\(resolve, reject\)[\s\S]*?server\.close\(\(error\)[\s\S]*?reject\(error\)/,
    "server.close callback errors must reject the transport-close promise"
  );
  assert.ok(serverClose >= 0 && closeIdle > serverClose, "idle cleanup must follow admission close");
  assert.ok(closeIdle < applicationCleanup, "idle keep-alive sockets must close before application drain");
});

test("custom Next runner validates shutdown timeout before clamping", () => {
  assert.match(
    runNextSource,
    /const\s+parsedShutdownTimeoutMs\s*=\s*Number\.parseInt\(process\.env\.SHUTDOWN_TIMEOUT_MS[\s\S]*?Number\.isFinite\(parsedShutdownTimeoutMs\)/,
    "invalid SHUTDOWN_TIMEOUT_MS must fall back instead of becoming NaN or bypassing the minimum"
  );
});
