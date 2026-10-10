import {
  fchmodSync,
  closeSync,
  constants,
  fsyncSync,
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

/**
 * Atomically replace a credential-bearing file without following the final
 * destination symlink or any parent-directory symlink. The temporary file is
 * private from its first filesystem operation. Parent ancestry and directory
 * identity are revalidated immediately before rename so a path swap does not
 * silently redirect the final replace operation.
 */
export function writePrivateFileAtomic(path, content, { mode = 0o600 } = {}) {
  const absolutePath = resolve(path);
  const { directory, identity } = ensureSafeDirectoryAncestry(dirname(absolutePath));
  const target = join(directory, basename(absolutePath));
  const suffix = randomBytes(8).toString("hex");
  const temporary = join(directory, `.${basename(absolutePath)}.${process.pid}.${suffix}.tmp`);
  let descriptor;

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

    assertDirectoryIdentity(directory, identity);
    renameSync(temporary, target);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {}
    }
    try {
      unlinkSync(temporary);
    } catch {}
    throw error;
  }
}
