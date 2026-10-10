import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const supportsBoundDirectoryPaths = process.platform === "linux" && fs.existsSync("/proc/self/fd");

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

test("parent swap at rename boundary cannot redirect or retain credential material", async () => {
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
    assert.equal(fs.existsSync(path.join(parked, "credentials.json")), false);
  } finally {
    fs.renameSync = originalRename;
    syncBuiltinESMExports();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
