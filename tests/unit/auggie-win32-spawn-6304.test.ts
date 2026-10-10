/**
 * Regression test for #6304 — Auggie (Augment CLI) provider always fails on
 * Windows with `spawn EINVAL`.
 *
 * Root cause: resolveAuggieBin() falls back to "auggie.cmd" (the global-npm
 * bin shim) on win32. Since Node's CVE-2024-27980 fix (Node >=18.20.2/
 * 20.12.2/21.7.3), `spawn()` refuses `.cmd`/`.bat` targets without
 * `shell: true`, throwing `spawn EINVAL`.
 *
 * Both auggie spawn sites build their options via the shared
 * buildAuggieSpawnOptions() helper, so asserting on that helper's output
 * covers spawnAuggie() (non-streaming path) and the inline spawn in
 * runStreaming() alike.
 */

import test from "node:test";
import assert from "node:assert/strict";

const { buildAuggieSpawnOptions, resolveAuggieBin } =
  await import("@agentproxy/open-sse/executors/auggie");

/** Temporarily override process.platform for the duration of `fn`. */
function withPlatform<T>(platform: string, fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(process, "platform", original);
  }
}

test("buildAuggieSpawnOptions sets shell:true on win32 (fixes spawn EINVAL)", () => {
  const options = withPlatform("win32", () => buildAuggieSpawnOptions(["pipe", "pipe", "pipe"]));
  assert.equal(
    options.shell,
    true,
    "spawn() must use shell:true on win32 or launching auggie.cmd throws EINVAL " +
      "(Node CVE-2024-27980 fix)"
  );
});

test("buildAuggieSpawnOptions leaves shell falsy on posix platforms", () => {
  for (const platform of ["linux", "darwin"]) {
    const options = withPlatform(platform, () => buildAuggieSpawnOptions(["pipe", "pipe", "pipe"]));
    assert.ok(!options.shell, `spawn() should not need shell interpretation on ${platform}`);
  }
});

test("buildAuggieSpawnOptions forwards the requested stdio and process.env", () => {
  const options = withPlatform("linux", () => buildAuggieSpawnOptions(["pipe", "pipe", "pipe"]));
  assert.deepEqual(options.stdio, ["pipe", "pipe", "pipe"]);
  assert.equal(options.env, process.env);
});

test("hostile Windows AUGGIE_BIN never crosses a shell parser", () => {
  const previous = process.env.AUGGIE_BIN;
  try {
    process.env.AUGGIE_BIN = String.raw`C:\tools\auggie.cmd & calc.exe`;
    const bin = withPlatform("win32", () => resolveAuggieBin());
    assert.equal(bin, process.env.AUGGIE_BIN);
    const options = withPlatform("win32", () =>
      buildAuggieSpawnOptions(["pipe", "pipe", "pipe"], bin)
    );
    assert.equal(
      options.shell,
      false,
      "an environment-controlled executable containing cmd.exe syntax must never use shell:true"
    );
  } finally {
    if (previous === undefined) delete process.env.AUGGIE_BIN;
    else process.env.AUGGIE_BIN = previous;
  }
});

test("Windows shell mode is limited to the trusted auggie.cmd fallback or strict absolute .cmd paths", () => {
  const fallback = withPlatform("win32", () =>
    buildAuggieSpawnOptions(["ignore", "pipe", "pipe"], "auggie.cmd")
  );
  assert.equal(fallback.shell, true, "the npm PATH shim must remain launchable");

  const safeAbsolute = withPlatform("win32", () =>
    buildAuggieSpawnOptions(
      ["ignore", "pipe", "pipe"],
      String.raw`C:\Users\alice\AppData\Roaming\npm\auggie.cmd`
    )
  );
  assert.equal(safeAbsolute.shell, true, "a strict absolute .cmd shim must remain launchable");

  for (const unsafe of [
    String.raw`C:\Program Files\npm\auggie.cmd`,
    String.raw`C:\tools\auggie.cmd|calc.exe`,
    String.raw`C:\tools\auggie.cmd%PATH%`,
    String.raw`C:\tools\auggie.cmd!VAR!`,
  ]) {
    const options = withPlatform("win32", () =>
      buildAuggieSpawnOptions(["ignore", "pipe", "pipe"], unsafe)
    );
    assert.equal(options.shell, false, `unsafe shell token must fail closed: ${unsafe}`);
  }
});
