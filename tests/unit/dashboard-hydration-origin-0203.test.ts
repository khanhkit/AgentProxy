import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  "src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.tsx",
  "src/app/docs/components/ApiExplorerClient.tsx",
];

for (const file of files) {
  test(`${file} uses the SSR-safe display base URL rather than a window-dependent state initializer`, () => {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /useState\(\s*typeof window !== ["']undefined["']/);
    assert.match(source, /useDisplayBaseUrl\(\)/);
  });
}
