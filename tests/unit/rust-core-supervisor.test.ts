import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureRustCoreInternalToken,
  isRustCoreEnabled,
  resolveRustCoreBinary,
  supportsLoopbackControl,
} from "../../scripts/dev/rust-core-supervisor.mjs";

test("Rust core mode is opt-in and exact", () => {
  assert.equal(isRustCoreEnabled({}), false);
  assert.equal(isRustCoreEnabled({ AGENTPROXY_RUST_CORE: "1" }), true);
  assert.equal(isRustCoreEnabled({ OMNIROUTE_RUST_CORE: "true" }), false);
  assert.equal(isRustCoreEnabled({ OMNIROUTE_RUST_CORE: "1" }), true);
});

test("internal service token is generated once and reused", () => {
  const env: Record<string, string | undefined> = {};
  const first = ensureRustCoreInternalToken(env);
  const second = ensureRustCoreInternalToken(env);
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.equal(env.OMNIROUTE_INTERNAL_SERVICE_TOKEN, first);
});

test("binary override wins and missing binaries fail closed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-rust-core-"));
  try {
    const binary = path.join(dir, "gateway");
    fs.writeFileSync(binary, "binary");
    assert.equal(
      resolveRustCoreBinary({ cwd: dir, env: { AGENTPROXY_RUST_CORE_BINARY: binary }, dev: false }),
      binary
    );
    assert.throws(
      () => resolveRustCoreBinary({ cwd: dir, env: {}, dev: false }),
      /Rust core binary not found/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("control plane requires a loopback-reachable dashboard bind", () => {
  for (const host of ["0.0.0.0", "::", "127.0.0.1", "::1", "localhost"]) {
    assert.equal(supportsLoopbackControl(host), true, host);
  }
  assert.equal(supportsLoopbackControl("192.168.1.10"), false);
});
