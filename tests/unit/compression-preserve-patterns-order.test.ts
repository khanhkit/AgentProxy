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
  assert.equal(
    result.blocks.some((entry) => entry.kind === "system_instruction"),
    false
  );
  assert.equal(
    result.blocks.some((entry) => entry.kind === "inline_code"),
    false
  );
  assert.equal(
    result.blocks.some((entry) => entry.kind === "url"),
    false
  );
});

test("AP-ISS-0196 review: custom preserve patterns cannot span across fenced code", () => {
  const text = ["before START", "```txt", "SECRET=inside-fence", "```", "END after"].join("\n");

  const result = extractPreservedBlocks(text, {
    preservePatterns: [/START[\s\S]*?END/],
  });

  assert.equal(result.blocks.filter((entry) => entry.kind === "custom").length, 0);
  const fenced = result.blocks.filter((entry) => entry.kind === "fenced_code");
  assert.equal(fenced.length, 1);
  assert.match(fenced[0].content, /SECRET=inside-fence/);
});
