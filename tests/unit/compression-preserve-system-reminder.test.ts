import test from "node:test";
import assert from "node:assert/strict";
import { extractPreservedBlocks } from "../../open-sse/services/compression/preservation.ts";

test("instruction envelopes are preserved as one opaque region", () => {
  const text = [
    "before",
    "<system-reminder>",
    "Do NOT delete production.",
    "```bash",
    "rm -rf /should-not-run",
    "```",
    "</system-reminder>",
    "after",
  ].join("\n");

  const result = extractPreservedBlocks(text);
  const block = result.blocks.find((entry) => entry.kind === "system_instruction");

  assert.ok(block);
  assert.match(block.content, /Do NOT delete production/);
  assert.match(block.content, /rm -rf/);
  assert.ok(!result.text.includes("Do NOT delete production"));
  assert.match(result.text, /before/);
  assert.match(result.text, /after/);
});

test("instructions and project-instructions envelopes are preserved", () => {
  for (const text of [
    "<instructions>Never mutate prod.</instructions>",
    "<project-instructions>Never delete DB.</project-instructions>",
  ]) {
    assert.equal(
      extractPreservedBlocks(text).blocks.some((entry) => entry.kind === "system_instruction"),
      true
    );
  }
});
