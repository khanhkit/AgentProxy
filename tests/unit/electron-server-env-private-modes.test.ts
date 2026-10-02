// GHSA-mh4f-3xj9-4gc4: the desktop app writes the same generated secrets as
// scripts/build/bootstrap-env.mjs into <dataDir>/server.env. electron/main.js exports
// nothing, so this pins the contract at the source: private modes on write, and a repair
// of an earlier world-readable file before it is read. The behaviour itself is covered for
// the shared logic in bootstrap-env-private-modes.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "electron/main.js"), "utf8");

test("electron main still resolves the data dir and persists server.env", () => {
  assert.match(src, /function resolveDataDir\(overridePath, env = process\.env\) \{/);
  assert.match(src, /const serverEnvPath = path\.join\(dataDir, "server\.env"\);/);
});

test("server.env is written with the AgentProxy owner-only primitive", () => {
  assert.match(
    src,
    /writeOwnerOnlyFileSync\(serverEnvPath, lines\.join\("\\n"\), \{ encoding: "utf8" \}\);/
  );
});

test("a new data dir is created 0700", () => {
  assert.match(src, /fs\.mkdirSync\(dataDir, \{ recursive: true, mode: 0o700 \}\);/);
});

test("an existing server.env and data dir are repaired before secrets are read", () => {
  assert.match(src, /tightenServerEnv\(dataDir, serverEnvPath\);/);
  assert.match(src, /repairOwnerOnlyFileSync\(serverEnvPath\);/);
  assert.match(src, /const persisted = parseEnvFile\(serverEnvPath\);/);
  assert.match(src, /if \(fs\.existsSync\(serverEnvPath\)\) chmodQuietly\(serverEnvPath, 0o600\);/);
});
