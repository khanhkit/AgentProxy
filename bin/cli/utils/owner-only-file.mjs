import { spawnSync as nodeSpawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const OWNER_ONLY_FILE_MODE = 0o600;

function asText(value) {
  if (typeof value === "string") return value;
  return value ? value.toString("utf8") : "";
}

function assertSafeParentDirectory(filePath, platform) {
  if (platform === "win32") return;
  const parent = path.dirname(path.resolve(filePath));
  const stat = fs.statSync(parent);
  if (!stat.isDirectory())
    throw new Error(`Unsafe secret-file parent: ${parent} is not a directory`);
  if ((stat.mode & 0o022) !== 0) {
    throw new Error(`Unsafe shared-writable secret-file parent: ${parent}`);
  }
  if (typeof process.geteuid === "function" && stat.uid !== process.geteuid()) {
    throw new Error(`Unsafe secret-file parent ownership: ${parent}`);
  }
}

function assertRegularFile(filePath) {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Unsafe secret-file target: ${filePath}`);
  }
}

function runWindowsAclCommand(spawnSync, command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
  if (result?.error || result?.status !== 0) {
    const detail =
      asText(result?.stderr).trim() || result?.error?.message || `exit ${result?.status}`;
    throw new Error(`Failed to apply owner-only Windows ACL via ${command}: ${detail}`);
  }
  return asText(result?.stdout);
}

function resolveWindowsUserSid(spawnSync) {
  const stdout = runWindowsAclCommand(spawnSync, "whoami", ["/user", "/fo", "csv", "/nh"]);
  const sid = stdout.match(/S-\d+(?:-\d+)+/)?.[0];
  if (!sid)
    throw new Error("Failed to apply owner-only Windows ACL: current user SID was not resolved");
  return sid;
}

export function applyOwnerOnlyPermissionsSync(filePath, runtime = {}) {
  assertRegularFile(filePath);
  const platform = runtime.platform ?? process.platform;
  if (platform === "win32") {
    const spawnSync = runtime.spawnSync ?? nodeSpawnSync;
    const sid = resolveWindowsUserSid(spawnSync);
    runWindowsAclCommand(spawnSync, "icacls", [filePath, "/reset", "/C"]);
    runWindowsAclCommand(spawnSync, "icacls", [filePath, "/inheritance:r", "/C"]);
    runWindowsAclCommand(spawnSync, "icacls", [filePath, "/grant:r", `*${sid}:(F)`, "/C"]);
    return;
  }
  fs.chmodSync(filePath, OWNER_ONLY_FILE_MODE);
}

export function repairOwnerOnlyFileSync(filePath, runtime = {}) {
  const platform = runtime.platform ?? process.platform;
  assertSafeParentDirectory(filePath, platform);
  applyOwnerOnlyPermissionsSync(filePath, runtime);
}

export function writeOwnerOnlyFileSync(filePath, data, options = {}) {
  const runtime = options.runtime ?? {};
  const platform = runtime.platform ?? process.platform;
  assertSafeParentDirectory(filePath, platform);

  const existed = fs.existsSync(filePath);
  if (existed) assertRegularFile(filePath);

  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | noFollow;
  const fd = fs.openSync(filePath, flags, OWNER_ONLY_FILE_MODE);
  let completed = false;
  try {
    if (platform === "win32") applyOwnerOnlyPermissionsSync(filePath, runtime);
    else fs.fchmodSync(fd, OWNER_ONLY_FILE_MODE);
    fs.ftruncateSync(fd, 0);
    if (typeof data === "string")
      fs.writeFileSync(fd, data, { encoding: options.encoding ?? "utf8" });
    else fs.writeFileSync(fd, data);
    completed = true;
  } finally {
    fs.closeSync(fd);
    if (!completed && !existed) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Best effort cleanup of an empty file created before hardening failed.
      }
    }
  }
}
