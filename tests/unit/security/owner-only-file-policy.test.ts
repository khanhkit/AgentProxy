import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function loadTsPolicy() {
  try {
    return await import("../../../src/lib/security/ownerOnlyFile.ts");
  } catch {
    return null;
  }
}

test("owner-only writer creates and repairs secret files as 0600 under a permissive umask", async () => {
  const policy = await loadTsPolicy();
  assert.ok(policy, "expected the reusable owner-only file policy module to exist");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-owner-only-"));
  const filePath = path.join(root, "secret.txt");
  const previousUmask = process.umask(0);
  try {
    policy.writeOwnerOnlyFileSync(filePath, "first");
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);

    fs.chmodSync(filePath, 0o666);
    policy.writeOwnerOnlyFileSync(filePath, "second");
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(filePath, "utf8"), "second");
  } finally {
    process.umask(previousUmask);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("owner-only writer rejects symlink targets and shared-writable parent directories", async () => {
  const policy = await loadTsPolicy();
  assert.ok(policy);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-owner-only-guard-"));
  try {
    const target = path.join(root, "target.txt");
    const link = path.join(root, "secret-link.txt");
    fs.writeFileSync(target, "unchanged");
    fs.symlinkSync(target, link);
    assert.throws(() => policy.writeOwnerOnlyFileSync(link, "secret"));
    assert.equal(fs.readFileSync(target, "utf8"), "unchanged");

    if (process.platform !== "win32") {
      const shared = path.join(root, "shared");
      fs.mkdirSync(shared, { mode: 0o777 });
      fs.chmodSync(shared, 0o777);
      assert.throws(
        () => policy.writeOwnerOnlyFileSync(path.join(shared, "secret.txt"), "secret"),
        /shared-writable|unsafe/i
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Windows owner-only policy applies ACL before accepting a secret file and fails closed", async () => {
  const policy = await loadTsPolicy();
  assert.ok(policy);
  assert.equal(typeof policy.applyOwnerOnlyPermissionsSync, "function");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-owner-only-win-"));
  const filePath = path.join(root, "server.key");
  fs.writeFileSync(filePath, "existing");
  const calls: Array<{ command: string; args: string[] }> = [];
  const okSpawn = (command: string, args: readonly string[]) => {
    calls.push({ command, args: [...args] });
    if (command === "whoami") {
      return {
        status: 0,
        stdout: '"DESKTOP\\\\user","S-1-5-21-111-222-333-1001"\r\n',
        stderr: "",
      };
    }
    return { status: 0, stdout: "", stderr: "" };
  };

  try {
    policy.applyOwnerOnlyPermissionsSync(filePath, {
      platform: "win32",
      spawnSync: okSpawn,
    });
    assert.deepEqual(
      calls.map((call) => [call.command, ...call.args]),
      [
        ["whoami", "/user", "/fo", "csv", "/nh"],
        ["icacls", filePath, "/reset", "/C"],
        ["icacls", filePath, "/inheritance:r", "/C"],
        ["icacls", filePath, "/grant:r", "*S-1-5-21-111-222-333-1001:(F)", "/C"],
      ]
    );

    const failingSpawn = (command: string, _args: readonly string[]) => {
      if (command === "whoami") {
        return {
          status: 0,
          stdout: '"DESKTOP\\\\user","S-1-5-21-111-222-333-1001"\r\n',
          stderr: "",
        };
      }
      return { status: 5, stdout: "", stderr: "Access is denied." };
    };
    assert.throws(
      () =>
        policy.applyOwnerOnlyPermissionsSync(filePath, {
          platform: "win32",
          spawnSync: failingSpawn,
        }),
      /Windows ACL|icacls|owner-only/i
    );

    fs.writeFileSync(filePath, "old-secret");
    assert.throws(
      () =>
        policy.writeOwnerOnlyFileSync(filePath, "new-secret", {
          runtime: { platform: "win32", spawnSync: failingSpawn },
        }),
      /Windows ACL|icacls|owner-only/i
    );
    assert.equal(
      fs.readFileSync(filePath, "utf8"),
      "old-secret",
      "ACL failure must leave existing secret contents untouched"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
