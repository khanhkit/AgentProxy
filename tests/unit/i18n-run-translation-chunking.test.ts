import test from "node:test";
import assert from "node:assert/strict";
import {
  chunkMarkdown,
  joinTranslatedChunks,
} from "../../scripts/i18n/run-translation.mjs";

const para = (label: string, n = 12) =>
  Array.from({ length: n }, (_, i) => `${label} sentence ${i + 1} with some filler text.`).join(
    " "
  );

test("a section longer than maxChars is split on sub-headings and paragraphs", () => {
  const body = [
    "## Big",
    para("a"),
    "",
    "### Part one",
    para("b"),
    "",
    para("c"),
    "",
    "### Part two",
    para("d"),
  ].join("\n");
  const chunks = chunkMarkdown(body, 700);
  assert.ok(chunks.length > 1, "must split an oversized section");
  for (const chunk of chunks) assert.ok(chunk.length <= 700, `chunk too big: ${chunk.length}`);
  const lines = (s: string) => s.split("\n").filter((line) => line.trim() !== "");
  assert.deepEqual(lines(chunks.join("\n\n")), lines(body));
});

test("never splits inside a fenced code block", () => {
  const code = [
    "```ts",
    ...Array.from({ length: 30 }, (_, i) => `const v${i} = ${i};`),
    "```",
  ].join("\n");
  const body = ["## Code", para("x"), "", code, "", para("y")].join("\n");
  const chunks = chunkMarkdown(body, 500);
  const withFence = chunks.filter((chunk) => chunk.includes("```"));
  for (const chunk of withFence) {
    assert.equal(
      (chunk.match(/```/g) ?? []).length % 2,
      0,
      "fence must open and close in the same chunk"
    );
  }
});

test("keeps short pages and normal heading cuts stable", () => {
  assert.deepEqual(chunkMarkdown("# Title\n\nshort", 6000), ["# Title\n\nshort"]);
  const body = [
    "## A",
    para("a", 4),
    "",
    "## B",
    para("b", 4),
    "",
    "## C",
    para("c", 4),
  ].join("\n");
  const chunks = chunkMarkdown(body, 400);
  assert.ok(chunks.every((chunk) => chunk.length <= 400));
  assert.ok(chunks.length > 1);
  for (const chunk of chunks.slice(1)) assert.match(chunk, /^## /);
});

const row = (i: number) =>
  `| p${i} | alias${i} | Provider ${i} | tag | https://p${i}.example | notes |`;

test("an oversized table block is split at row boundaries", () => {
  const table = [
    "| ID | Alias | Name | Tags | Website | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
  ]
    .concat(Array.from({ length: 40 }, (_, i) => row(i)))
    .join("\n");
  const body = `## Providers\n\n${table}\n`;
  const chunks = chunkMarkdown(body, 900);
  assert.ok(chunks.length > 3, `expected several chunks, got ${chunks.length}`);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 900, `chunk of ${chunk.length} chars exceeds maxChars`);
    for (const line of chunk.split("\n").filter((candidate) => candidate.startsWith("|"))) {
      assert.ok(line.endsWith("|"), `row cut in half: ${line}`);
    }
  }
  assert.equal(joinTranslatedChunks(chunks).trim(), body.trim());
});

test("joinTranslatedChunks preserves normal and table seams", () => {
  assert.equal(
    joinTranslatedChunks(["## A\ntext", "## B\nmore"]),
    "## A\ntext\n\n## B\nmore"
  );
  assert.equal(
    joinTranslatedChunks(["| a | b |", "| c | d |"]),
    "| a | b |\n| c | d |"
  );
});

test("an oversized tight bullet list splits only between items", () => {
  const items = Array.from(
    { length: 30 },
    (_, i) =>
      `- **\`p${i}\`** — shipped note says one thing, reality shows another for provider ${i}.\n  continued detail line ${i}`
  );
  const body = `## Notes\n\n${items.join("\n")}\n`;
  const chunks = chunkMarkdown(body, 900);
  assert.ok(chunks.length > 3, `expected several chunks, got ${chunks.length}`);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 900, `chunk of ${chunk.length} chars exceeds maxChars`);
    assert.ok(!/^\s+continued/.test(chunk), "a chunk must not start with a continuation line");
  }
  assert.equal(joinTranslatedChunks(chunks).trim(), body.trim());
});
