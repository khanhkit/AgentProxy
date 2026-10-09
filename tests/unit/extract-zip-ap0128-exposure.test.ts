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

test("AP-ISS-0128: patched codex-security removes extract-zip from the lock", () => {
  const lock = readLockfile();
  const codexSecurity = lock.packages?.["node_modules/@openai/codex-security"] as
    | (LockPackage & { version?: string })
    | undefined;

  assert.equal(codexSecurity?.version, "0.2.0");
  assert.deepEqual(declaredDependents(lock, "extract-zip"), []);
  assert.equal(lock.packages?.["node_modules/extract-zip"], undefined);
  assert.deepEqual(declaredDependents(lock, "@openai/codex-security"), ["node_modules/promptfoo"]);
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
