import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    "open-sse/services/compression/engines/llmlingua/index.ts"
  ),
  "utf8"
);

test("LLMLingua shields tags and negation spans before the backend", () => {
  assert.match(source, /const PROTECTED_SPAN_RE =/);
  assert.match(source, /function splitProtectedSpans\(prose: string\)/);
  assert.match(source, /return splitProtectedSpans\(text\)/);
  assert.match(source, /segments\.push\(\.\.\.splitProtectedSpans\(part\)\)/);
});

test("LLMLingua restores source casing and edge whitespace", () => {
  assert.match(source, /function restoreSourceCase\(source: string, output: string\)/);
  assert.match(source, /let out = restoreSourceCase\(text, compressed\)/);
  assert.match(source, /const leading = text\.match\(\/\^\\s\*\//);
  assert.match(source, /const trailing = text\.match\(\/\\s\*\$\//);
});

test("LLMLingua fails open on empty backend replies", () => {
  assert.match(
    source,
    /if \(typeof compressed !== "string" \|\| !compressed\.trim\(\)\)/
  );
  assert.match(source, /return \{ text, didCompress: false \}/);
});
