import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MIN_PATCHED = [0, 28, 1] as const;

function isPatched(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;

  const current = match.slice(1, 4).map(Number);
  for (let index = 0; index < MIN_PATCHED.length; index += 1) {
    if (current[index] !== MIN_PATCHED[index]) {
      return current[index] > MIN_PATCHED[index];
    }
  }
  return true;
}

test("TC-SUPPLYCHAIN-REG-0111 rejects vulnerable esbuild lockfile resolutions", async () => {
  const lock = JSON.parse(
    await readFile(new URL("../package-lock.json", import.meta.url), "utf8")
  ) as {
    packages?: Record<string, { version?: string }>;
  };

  const vulnerable = Object.entries(lock.packages ?? {})
    .filter(
      ([path, metadata]) =>
        path.endsWith("/esbuild") && metadata.version && !isPatched(metadata.version)
    )
    .map(([path, metadata]) => path + "@" + metadata.version);

  assert.deepEqual(vulnerable, []);
});
