import path from "node:path";

function isWithin(rootDir, candidate) {
  const rel = path.relative(rootDir, candidate);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

export function portableSymlinkTarget(linkPath, rawTarget, portableRoot = process.cwd()) {
  if (!path.isAbsolute(rawTarget)) return rawTarget.split(path.sep).join("/");

  const root = path.resolve(portableRoot);
  const target = path.resolve(rawTarget);
  if (!isWithin(root, target)) return rawTarget;

  return path.relative(path.dirname(linkPath), target).split(path.sep).join("/");
}

export function comparableSymlinkTarget(target) {
  if (path.isAbsolute(target)) return path.normalize(target);
  return target.replaceAll("\\", "/");
}
