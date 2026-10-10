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
  assert.ok(applicationCleanup < closeIdle, "idle transport cleanup must wait for application drain");
  assert.ok(applicationCleanup < closeAll, "active transport cleanup must wait for application drain");
  assert.ok(closeAll < awaitServerClose, "force-close remaining sockets before awaiting server close completion");
  assert.ok(awaitServerClose < nextClose, "HTTP server must be closed before Next teardown");
  assert.ok(nextClose < rustStop, "Rust child must stop only after application/Next cleanup");
  assert.ok(rustStop < processExit, "process exit must remain the final shutdown action");
});

test("custom Next runner uses the configured global shutdown budget and preserves force-exit semantics", () => {
  assert.match(
    runNextSource,
    /const\s+SHUTDOWN_TIMEOUT_MS\s*=\s*[^;]*process\.env\.SHUTDOWN_TIMEOUT_MS/,
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
    /lifecycleReport\?\.clean\s*===\s*false[\s\S]*?exitCode\s*=\s*exitCode\s*\|\|\s*1/,
    "a non-clean application lifecycle report must produce a non-zero exit"
  );
});
