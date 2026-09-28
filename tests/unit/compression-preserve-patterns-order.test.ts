import test from "node:test";
import assert from "node:assert/strict";
import { extractPreservedBlocks } from "../../open-sse/services/compression/preservation.ts";

test("custom preserve region wins before built-ins and instruction regions", () => {
  const text = [
    "<system-reminder>",
    "# Deploy rules",
    "Run `npm test` and read https://example.com/runbook.",
    "Never change MAX_RETRIES.",
    "</system-reminder>",
    "outside",
  ].join("\n");

  const result = extractPreservedBlocks(text, {
    preservePatterns: [/<system-reminder>[\s\S]*?<\/system-reminder>/],
  });
  const custom = result.blocks.find((entry) => entry.kind === "custom");

  assert.ok(custom);
  assert.match(custom.content, /`npm test`/);
  assert.match(custom.content, /https:\/\/example\.com\/runbook/);
  assert.match(custom.content, /MAX_RETRIES/);
  assert.equal(result.blocks.some((entry) => entry.kind === "system_instruction"), false);
  assert.equal(result.blocks.some((entry) => entry.kind === "inline_code"), false);
  assert.equal(result.blocks.some((entry) => entry.kind === "url"), false);
});
