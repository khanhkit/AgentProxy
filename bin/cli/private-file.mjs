import {
  fchmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, parse, resolve, sep } from "node:path";

function failUnsafeParent(path, detail) {
  throw new Error(`Unsafe parent directory for private file ${path}: ${detail}`);
}

function pathIdentity(path) {
  const stat = statSync(path);
  if (!stat.isDirectory()) failUnsafeParent(path, "not a directory");
  return { dev: stat.dev, ino: stat.ino };
}

function identitiesMatch(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function assertCanonicalDirectory(path) {
  const canonical = realpathSync.native(path);
  const expected = resolve(path);
  const samePath =
    process.platform === "win32"
      ? canonical.toLowerCase() === expected.toLowerCase()
      : canonical === expected;
  if (!samePath) failUnsafeParent(path, `resolves through a symlink to ${canonical}`);
  return pathIdentity(expected);
}

function ensureSafeDirectoryAncestry(directory) {
  const absolute = resolve(directory);
  const { root } = parse(absolute);
  const remainder = absolute.slice(root.length);
  const components = remainder ? remainder.split(sep).filter(Boolean) : [];
  let current = root;

  for (const component of components) {
    current = join(current, component);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      mkdirSync(current, { mode: 0o700 });
      stat = lstatSync(current);
    }
    if (stat.isSymbolicLink()) failUnsafeParent(current, "symbolic-link ancestry is not allowed");
    if (!stat.isDirectory()) failUnsafeParent(current, "path component is not a directory");
  }

  const identity = assertCanonicalDirectory(absolute);
  return { directory: absolute, identity };
}

function assertDirectoryIdentity(directory, expectedIdentity) {
  const current = ensureSafeDirectoryAncestry(directory);
  if (!identitiesMatch(current.identity, expectedIdentity)) {
    failUnsafeParent(directory, "directory identity changed during atomic write");
  }
}

function openBoundDirectory(directory, expectedIdentity) {
  if (process.platform !== "linux" || !existsSync("/proc/self/fd")) {
    return { descriptor: undefined, operationDirectory: directory, bound: false };
  }

  const descriptor = openSync(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    const stat = fstatSync(descriptor);
    if (
      !stat.isDirectory() ||
      !identitiesMatch({ dev: stat.dev, ino: stat.ino }, expectedIdentity)
    ) {
      failUnsafeParent(directory, "directory identity changed before binding atomic write");
    }

    return {
      descriptor,
      operationDirectory: `/proc/self/fd/${descriptor}`,
      bound: true,
    };
  } catch (error) {
    try {
      closeSync(descriptor);
    } catch {}
    throw error;
  }
}

const BOUND_CWD_WRITER = String.raw`
const fs = require("node:fs");
const [targetName, temporaryName, modeText, expectedDev, expectedIno] = process.argv.slice(1);
const fail = (message, code = 70) => {
  process.stderr.write(message);
  process.exit(code);
};
try {
  const directory = fs.statSync(".");
  if (!directory.isDirectory() || String(directory.dev) !== expectedDev || String(directory.ino) !== expectedIno) {
    fail("BOUND_DIRECTORY_IDENTITY_MISMATCH", 73);
  }
  const mode = Number(modeText);
  let fd;
  try {
    fd = fs.openSync(
      temporaryName,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW || 0),
      mode
    );
    fs.writeFileSync(fd, fs.readFileSync(0, "utf8"), "utf8");
    fs.fchmodSync(fd, mode);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temporaryName, targetName);
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
    try { fs.unlinkSync(temporaryName); } catch {}
    throw error;
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
`;

function writePrivateFileViaBoundCwd(directory, expectedIdentity, targetName, content, mode) {
  const suffix = randomBytes(8).toString("hex");
  const temporaryName = `.${targetName}.${process.pid}.${suffix}.tmp`;
  const env = {};
  for (const key of ["SystemRoot", "WINDIR"]) {
    if (process.env[key]) env[key] = process.env[key];
  }

  const result = spawnSync(
    process.execPath,
    [
      "-e",
      BOUND_CWD_WRITER,
      targetName,
      temporaryName,
      String(mode),
      String(expectedIdentity.dev),
      String(expectedIdentity.ino),
    ],
    {
      cwd: directory,
      input: String(content),
      encoding: "utf8",
      env,
      windowsHide: true,
    }
  );

  if (result.status === 0 && !result.error) {
    assertDirectoryIdentity(directory, expectedIdentity);
    return;
  }

  const detail = String(
    result.stderr || result.error?.message || "bound directory helper failed"
  ).trim();
  if (detail.includes("BOUND_DIRECTORY_IDENTITY_MISMATCH")) {
    failUnsafeParent(directory, "bound directory identity changed before atomic write");
  }
  throw result.error ?? new Error(`Private-file bound directory helper failed: ${detail}`);
}

/**
 * Atomically replace a credential-bearing file without following the final
 * destination symlink or any parent-directory symlink. The temporary file is
 * private from its first filesystem operation. Linux binds operations to an
 * opened directory descriptor; other platforms use a helper process whose cwd
 * is identity-checked before relative temp creation + rename. A final ancestry
 * check reports a visible-parent swap without unlinking an unrelated replacement.
 */
export function writePrivateFileAtomic(path, content, { mode = 0o600 } = {}) {
  const absolutePath = resolve(path);
  const { directory, identity } = ensureSafeDirectoryAncestry(dirname(absolutePath));
  const binding = openBoundDirectory(directory, identity);
  const targetName = basename(absolutePath);

  if (!binding.bound) {
    writePrivateFileViaBoundCwd(directory, identity, targetName, content, mode);
    return;
  }

  const target = join(binding.operationDirectory, targetName);
  const suffix = randomBytes(8).toString("hex");
  const temporary = join(binding.operationDirectory, `.${targetName}.${process.pid}.${suffix}.tmp`);
  let descriptor;
  let renamed = false;

  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      mode
    );
    writeFileSync(descriptor, String(content), "utf8");
    fchmodSync(descriptor, mode);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;

    renameSync(temporary, target);
    renamed = true;
    assertDirectoryIdentity(directory, identity);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {}
    }
    if (!renamed) {
      try {
        unlinkSync(temporary);
      } catch {}
    }
    throw error;
  } finally {
    if (binding.descriptor !== undefined) {
      try {
        closeSync(binding.descriptor);
      } catch {}
    }
  }
}
