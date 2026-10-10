import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const supportsBoundDirectoryPaths = process.platform === "linux" && fs.existsSync("/proc/self/fd");

const childProcess = createRequire(import.meta.url)(
  "node:child_process"
) as typeof import("node:child_process");

function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(process, "platform", original);
  }
}

function directoryFds(directory: string): number[] {
  if (!supportsBoundDirectoryPaths) return [];
  const canonical = fs.realpathSync.native(directory);
  const result: number[] = [];
  for (const entry of fs.readdirSync("/proc/self/fd")) {
    const fd = Number(entry);
    if (!Number.isInteger(fd)) continue;
    try {
      if (fs.realpathSync.native(`/proc/self/fd/${fd}`) === canonical) result.push(fd);
    } catch {}
  }
  return result.sort((a, b) => a - b);
}

test("private atomic rename is bound to an opened parent directory on Linux", async () => {
  if (!supportsBoundDirectoryPaths) return;

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-private-fd-"));
  const parent = path.join(root, "safe");
  fs.mkdirSync(parent);
  const target = path.join(parent, "credentials.json");
  const originalRename = fs.renameSync;
  let observedSource = "";
  let observedTarget = "";

  fs.renameSync = ((source, destination) => {
    observedSource = String(source);
    observedTarget = String(destination);
    return originalRename(source, destination);
  }) as typeof fs.renameSync;
  syncBuiltinESMExports();

  try {
    const { writePrivateFileAtomic } = await import(
      `../../../bin/cli/private-file.mjs?fd-binding=${Date.now()}`
    );
    writePrivateFileAtomic(target, "secret");
    assert.match(observedSource, /^\/proc\/self\/fd\/\d+\//u);
    assert.match(observedTarget, /^\/proc\/self\/fd\/\d+\/credentials\.json$/u);
    assert.equal(fs.readFileSync(target, "utf8"), "secret");
  } finally {
    fs.renameSync = originalRename;
    syncBuiltinESMExports();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("parent swap at rename boundary stays confined to the original private directory", async () => {
  if (!supportsBoundDirectoryPaths) return;

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-private-race-"));
  const parent = path.join(root, "safe");
  const parked = path.join(root, "parked-safe");
  const outside = path.join(root, "outside");
  fs.mkdirSync(parent);
  fs.mkdirSync(outside);
  const target = path.join(parent, "credentials.json");
  const originalRename = fs.renameSync;
  let intercepted = false;

  fs.renameSync = ((source, destination) => {
    if (!intercepted && String(destination).endsWith("/credentials.json")) {
      intercepted = true;
      originalRename(parent, parked);
      fs.symlinkSync(outside, parent, "dir");
    }
    return originalRename(source, destination);
  }) as typeof fs.renameSync;
  syncBuiltinESMExports();

  try {
    const { writePrivateFileAtomic } = await import(
      `../../../bin/cli/private-file.mjs?parent-race=${Date.now()}`
    );
    assert.throws(
      () => writePrivateFileAtomic(target, "credential-secret"),
      /unsafe parent|symbolic-link|identity changed/i
    );
    assert.equal(fs.existsSync(path.join(outside, "credentials.json")), false);
    const parkedTarget = path.join(parked, "credentials.json");
    assert.equal(fs.readFileSync(parkedTarget, "utf8"), "credential-secret");
    assert.equal(fs.statSync(parkedTarget).mode & 0o777, 0o600);
  } finally {
    fs.renameSync = originalRename;
    syncBuiltinESMExports();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("directory binding closes the opened handle when fstat validation throws", async () => {
  if (!supportsBoundDirectoryPaths) return;

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-private-fstat-"));
  const parent = path.join(root, "safe");
  fs.mkdirSync(parent);
  const target = path.join(parent, "credentials.json");
  const before = new Set(directoryFds(parent));
  const originalFstat = fs.fstatSync;
  let leaked: number[] = [];

  fs.fstatSync = ((fd, options) => {
    try {
      if (fs.realpathSync.native(`/proc/self/fd/${fd}`) === fs.realpathSync.native(parent)) {
        throw new Error("forced directory fstat failure");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "forced directory fstat failure") throw error;
    }
    return originalFstat(fd, options as never);
  }) as typeof fs.fstatSync;
  syncBuiltinESMExports();

  try {
    const { writePrivateFileAtomic } = await import(
      `../../../bin/cli/private-file.mjs?fstat-cleanup=${Date.now()}`
    );
    assert.throws(
      () => writePrivateFileAtomic(target, "secret"),
      /forced directory fstat failure/u
    );
    leaked = directoryFds(parent).filter((fd) => !before.has(fd));
    assert.deepEqual(leaked, [], "failed directory binding must not leak the opened fd");
  } finally {
    fs.fstatSync = originalFstat;
    syncBuiltinESMExports();
    for (const fd of leaked) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("non-Linux fallback preserves atomic private writes for a stable directory", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-private-bound-cwd-ok-"));
  const parent = path.join(root, "safe");
  fs.mkdirSync(parent);
  const target = path.join(parent, "credentials.json");

  try {
    const { writePrivateFileAtomic } = await import(
      `../../../bin/cli/private-file.mjs?bound-cwd-ok=${Date.now()}`
    );
    withPlatform("win32", () => writePrivateFileAtomic(target, "credential-secret"));
    assert.equal(fs.readFileSync(target, "utf8"), "credential-secret");
    assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("non-Linux fallback binds the operation before a parent-path swap", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-private-bound-cwd-"));
  const parent = path.join(root, "safe");
  const parked = path.join(root, "parked-safe");
  const outside = path.join(root, "outside");
  fs.mkdirSync(parent);
  fs.mkdirSync(outside);
  const target = path.join(parent, "credentials.json");
  const originalSpawnSync = childProcess.spawnSync;
  let intercepted = false;

  childProcess.spawnSync = ((...args: Parameters<typeof childProcess.spawnSync>) => {
    if (!intercepted) {
      intercepted = true;
      fs.renameSync(parent, parked);
      fs.symlinkSync(outside, parent, "dir");
    }
    return originalSpawnSync(...args);
  }) as typeof childProcess.spawnSync;
  syncBuiltinESMExports();

  try {
    const { writePrivateFileAtomic } = await import(
      `../../../bin/cli/private-file.mjs?bound-cwd=${Date.now()}`
    );
    assert.throws(
      () => withPlatform("win32", () => writePrivateFileAtomic(target, "credential-secret")),
      /unsafe parent|identity changed|bound directory/i
    );
    assert.equal(intercepted, true, "non-Linux fallback must use the bound-cwd helper");
    assert.equal(fs.existsSync(path.join(outside, "credentials.json")), false);
    assert.equal(fs.existsSync(path.join(parked, "credentials.json")), false);
  } finally {
    childProcess.spawnSync = originalSpawnSync;
    syncBuiltinESMExports();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("post-rename parent failure never unlinks a concurrent replacement", async () => {
  if (!supportsBoundDirectoryPaths) return;

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-private-replacement-"));
  const parent = path.join(root, "safe");
  const parked = path.join(root, "parked-safe");
  const outside = path.join(root, "outside");
  fs.mkdirSync(parent);
  fs.mkdirSync(outside);
  const target = path.join(parent, "credentials.json");
  const originalRename = fs.renameSync;
  let intercepted = false;

  fs.renameSync = ((source, destination) => {
    if (!intercepted && String(destination).endsWith("/credentials.json")) {
      intercepted = true;
      originalRename(source, destination);
      originalRename(parent, parked);
      fs.symlinkSync(outside, parent, "dir");
      originalRename(
        path.join(parked, "credentials.json"),
        path.join(parked, "original-credential")
      );
      fs.writeFileSync(path.join(parked, "credentials.json"), "replacement", { mode: 0o600 });
      return;
    }
    return originalRename(source, destination);
  }) as typeof fs.renameSync;
  syncBuiltinESMExports();

  try {
    const { writePrivateFileAtomic } = await import(
      `../../../bin/cli/private-file.mjs?replacement-race=${Date.now()}`
    );
    assert.throws(
      () => writePrivateFileAtomic(target, "credential-secret"),
      /unsafe parent|symbolic-link|identity changed/i
    );
    assert.equal(
      fs.readFileSync(path.join(parked, "credentials.json"), "utf8"),
      "replacement",
      "failure cleanup must not unlink a file that replaced the committed target"
    );
    assert.equal(fs.existsSync(path.join(outside, "credentials.json")), false);
  } finally {
    fs.renameSync = originalRename;
    syncBuiltinESMExports();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
