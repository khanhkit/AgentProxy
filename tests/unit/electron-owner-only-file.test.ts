import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type SpawnResult = { status: number; stdout: string; stderr: string };
type SpawnLike = (command: string, args: readonly string[]) => SpawnResult;

type ElectronOwnerOnlyPolicy = {
  writeOwnerOnlyFileSync(filePath: string, data: string): void;
  repairOwnerOnlyFileSync(filePath: string): void;
  applyOwnerOnlyPermissionsSync(
    filePath: string,
    runtime: { platform: "win32"; spawnSync: SpawnLike }
  ): void;
};

function loadPolicy(): ElectronOwnerOnlyPolicy | null {
  try {
    return require("../../electron/lib/ownerOnlyFile.js") as ElectronOwnerOnlyPolicy;
  } catch {
    return null;
  }
}

test("Electron owner-only writer protects server.env under permissive umask", () => {
  const policy = loadPolicy();
  assert.ok(policy, "expected packaged Electron owner-only writer");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-electron-owner-only-"));
  const filePath = path.join(root, "server.env");
  const oldUmask = process.umask(0);
  try {
    policy.writeOwnerOnlyFileSync(filePath, "JWT_SECRET=test\n");
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    fs.chmodSync(filePath, 0o666);
    policy.repairOwnerOnlyFileSync(filePath);
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
  } finally {
    process.umask(oldUmask);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Electron Windows adapter applies current-user ACL and fails closed on icacls errors", () => {
  const policy = loadPolicy();
  assert.ok(policy);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-electron-owner-win-"));
  const filePath = path.join(root, "server.env");
  fs.writeFileSync(filePath, "existing");
  const calls: Array<[string, ...string[]]> = [];
  const spawnSync = (command: string, args: readonly string[]) => {
    calls.push([command, ...args]);
    if (command === "whoami") {
      return { status: 0, stdout: '"PC\\\\user","S-1-5-21-6-5-4-1001"\r\n', stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  try {
    policy.applyOwnerOnlyPermissionsSync(filePath, { platform: "win32", spawnSync });
    assert.deepEqual(calls, [
      ["whoami", "/user", "/fo", "csv", "/nh"],
      ["icacls", filePath, "/reset", "/C"],
      ["icacls", filePath, "/inheritance:r", "/C"],
      ["icacls", filePath, "/grant:r", "*S-1-5-21-6-5-4-1001:(F)", "/C"],
    ]);

    const failingSpawn = (command: string) =>
      command === "whoami"
        ? { status: 0, stdout: '"PC\\\\user","S-1-5-21-6-5-4-1001"\r\n', stderr: "" }
        : { status: 5, stdout: "", stderr: "Access denied" };
    assert.throws(
      () =>
        policy.applyOwnerOnlyPermissionsSync(filePath, {
          platform: "win32",
          spawnSync: failingSpawn,
        }),
      /Windows ACL|icacls|owner-only/i
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Electron main repairs server.env before reading and uses the owner-only writer", () => {
  const source = fs.readFileSync(path.join(import.meta.dirname, "../../electron/main.js"), "utf8");
  assert.match(source, /require\(["']\.\/lib\/ownerOnlyFile["']\)/);
  const repairIndex = source.indexOf("repairOwnerOnlyFileSync(serverEnvPath)");
  const readIndex = source.indexOf("parseEnvFile(serverEnvPath)");
  assert.ok(
    repairIndex >= 0 && readIndex >= 0 && repairIndex < readIndex,
    "server.env must be repaired before secrets are read"
  );
  assert.match(source, /writeOwnerOnlyFileSync\(serverEnvPath,\s*lines\.join\(["']\\n["']\)/);
});
