import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/usage/callLogArtifacts.ts"), "utf8");

test("TC-OMNIDB-LOG-036A: size fallback has request-only omission stage before both-bodies", () => {
  assert.match(source, /const omitBodies = <T extends object>\(value: T, keepResponse = false\)/);
  assert.match(
    source,
    /responseBody:\s*keepResponse\s*\?\s*\(value as \{ responseBody: unknown \}\)\.responseBody\s*:\s*OMITTED_FOR_SIZE_LIMIT/
  );
  assert.match(
    source,
    /\.\.\.\(artifact\.pipeline \? \[\(\) => omitBodies\(artifact, true\)\] : \[\]\)/
  );
  assert.match(source, /\.\.\.\(artifact\.pipeline \? \[\(\) => omitBodies\(artifact\)\] : \[\]\)/);
});

test("TC-OMNIDB-LOG-036B: pipeline is omitted only after body-preserving stages", () => {
  const requestOnly = source.indexOf("omitBodies(artifact, true)");
  const bothBodies = source.indexOf("omitBodies(artifact)]");
  const dropPipeline = source.indexOf("() => omitOversizedPipeline(artifact)");
  assert.ok(requestOnly >= 0 && bothBodies > requestOnly && dropPipeline > bothBodies);
});
