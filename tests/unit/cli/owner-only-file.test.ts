import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function loadPolicy() {
  try {
    return await import("../../../bin/cli/utils/owner-only-file.mjs");
  } catch {
    return null;
  }
}

test("CLI owner-only writer creates and repairs files as 0600 under umask 000", async () => {
  const policy = await loadPolicy();
  assert.ok(policy, "expected CLI owner-only writer module");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-cli-owner-only-"));
  const filePath = path.join(root, "auth.json");
  const oldUmask = process.umask(0);
  try {
    policy.writeOwnerOnlyFileSync(filePath, "first");
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    fs.chmodSync(filePath, 0o666);
    policy.writeOwnerOnlyFileSync(filePath, "second");
    assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(filePath, "utf8"), "second");
  } finally {
    process.umask(oldUmask);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CLI Windows policy covers every audited Cline/Kilo/Roo secret sink", async () => {
  const policy = await loadPolicy();
  assert.ok(policy);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-cli-owner-win-"));
  const filePaths = [
    path.join(root, "cline", "secrets.json"),
    path.join(root, "kilo", "auth.json"),
    path.join(root, "Code", "User", "settings.json"),
    path.join(root, "roo", "roo-settings.json"),
  ];
  const calls: Array<[string, ...string[]]> = [];
  const spawnSync = (command: string, args: readonly string[]) => {
    calls.push([command, ...args]);
    if (command === "whoami") {
      return { status: 0, stdout: '"PC\\\\user","S-1-5-21-9-8-7-1001"\r\n', stderr: "" };
    }
    return { status: 0, stdout: "", stderr: "" };
  };
  try {
    for (const filePath of filePaths) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "existing");
      calls.length = 0;
      policy.applyOwnerOnlyPermissionsSync(filePath, { platform: "win32", spawnSync });
      assert.deepEqual(calls, [
        ["whoami", "/user", "/fo", "csv", "/nh"],
        ["icacls", filePath, "/reset", "/C"],
        ["icacls", filePath, "/inheritance:r", "/C"],
        ["icacls", filePath, "/grant:r", "*S-1-5-21-9-8-7-1001:(F)", "/C"],
      ]);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
