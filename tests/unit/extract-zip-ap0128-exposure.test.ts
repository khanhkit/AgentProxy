import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..", "..");

interface LockPackage {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}
interface Lockfile {
  packages?: Record<string, LockPackage>;
}
function readLockfile(): Lockfile {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "package-lock.json"), "utf8")) as Lockfile;
}
function declaredDependents(lock: Lockfile, depName: string): string[] {
  const dependents: string[] = [];
  for (const [key, pkg] of Object.entries(lock.packages ?? {})) {
    if (key === "") continue;
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
    if (Object.prototype.hasOwnProperty.call(deps, depName)) dependents.push(key);
  }
  return dependents;
}

test("AP-ISS-0128: extract-zip advisories remain confined to promptfoo dev tooling", () => {
  const lock = readLockfile();
  const root = lock.packages?.[""] ?? {};

  assert.ok(!Object.prototype.hasOwnProperty.call(root.dependencies ?? {}, "extract-zip"));
  assert.ok(!Object.prototype.hasOwnProperty.call(root.devDependencies ?? {}, "extract-zip"));
  assert.deepEqual(declaredDependents(lock, "extract-zip"), [
    "node_modules/@openai/codex-security",
  ]);
  assert.deepEqual(declaredDependents(lock, "@openai/codex-security"), ["node_modules/promptfoo"]);
  assert.ok(Object.prototype.hasOwnProperty.call(root.devDependencies ?? {}, "promptfoo"));
  assert.ok(!Object.prototype.hasOwnProperty.call(root.dependencies ?? {}, "promptfoo"));
});

test("AP-ISS-0128: production/runtime code never imports extract-zip", () => {
  const scanDirs = ["src", "open-sse", "bin"].map((dir) => path.join(ROOT, dir));
  const offenders: string[] = [];

  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(full);
      } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
        const content = fs.readFileSync(full, "utf8");
        if (/(?:from\s+["']extract-zip["']|require\(["']extract-zip["']\))/.test(content)) {
          offenders.push(full);
        }
      }
    }
  }

  for (const dir of scanDirs) walk(dir);
  assert.deepEqual(offenders, []);
});
