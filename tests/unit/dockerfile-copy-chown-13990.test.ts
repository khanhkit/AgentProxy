/**
 * Guard the runner-debian-base ownership strategy: app artifacts must be copied with
 * node ownership instead of being recursively chowned in a second image layer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
const lines = dockerfile.split("\n");

function runnerDebianBaseStage(): string[] {
  const start = lines.findIndex((line) => /^FROM\s+\S+\s+AS\s+runner-debian-base\b/i.test(line.trim()));
  assert.ok(start >= 0, "Dockerfile must declare runner-debian-base");
  const after = lines.slice(start + 1).findIndex((line) => /^FROM\s+/i.test(line.trim()));
  const end = after === -1 ? lines.length : start + 1 + after;
  return lines.slice(start, end).filter((line) => !line.trim().startsWith("#"));
}

test("runner-debian-base copies builder artifacts with node ownership and no recursive chown", () => {
  const stage = runnerDebianBaseStage();
  const artifactCopies = stage.filter((line) => /^COPY\b.*--from=(?:builder|rust-builder)\b/.test(line));
  assert.ok(artifactCopies.length >= 4, "expected standalone, Rust gateway, sqlite and healthcheck copies");
  for (const line of artifactCopies) {
    assert.match(line, /--chown=node:node\b/, `COPY must set node ownership: ${line}`);
  }
  assert.ok(!stage.some((line) => /^RUN\b.*chown\s+-R\b/.test(line)), "runner-debian-base must not recursively chown /app");
});

test("runner-debian-base creates writable app/data roots without recursive ownership rewrite", () => {
  const stage = runnerDebianBaseStage();
  assert.ok(
    stage.some((line) => /^RUN\b.*mkdir -p \/app\/data\s*&&\s*chown node:node \/app \/app\/data\b/.test(line)),
    "runner-debian-base must chown /app and /app/data non-recursively"
  );
});
