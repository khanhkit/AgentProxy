import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const STATIC_IMPORT_RE =
  /^import\s+[\s\S]*?from\s+["']@agentproxy\/open-sse\/services\/chatgptWebCodexAdmin\.ts["'];?\s*$/m;
const DYNAMIC_IMPORT_RE =
  /await import\(["']@agentproxy\/open-sse\/services\/chatgptWebCodexAdmin\.ts["']\)/;

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

for (const routePath of [
  "src/app/api/providers/route.ts",
  "src/app/api/providers/[id]/route.ts",
]) {
  test(`${routePath} lazily imports chatgptWebCodexAdmin`, () => {
    const source = readSource(routePath);
    assert.doesNotMatch(source, STATIC_IMPORT_RE);
    assert.match(source, DYNAMIC_IMPORT_RE);
  });
}
