import test from "node:test";
import assert from "node:assert/strict";
import { extractPreservedBlocks } from "../../open-sse/services/compression/preservation.ts";

test("system instruction envelopes stay atomic before custom and built-in preservation", () => {
  const text = [
    "<system-reminder>",
    "# Deploy rules",
    "Run `npm test` and read https://example.com/runbook.",
    "Never change MAX_RETRIES.",
    "</system-reminder>",
    "outside",
  ].join("\n");

  const result = extractPreservedBlocks(text, {
    preservePatterns: [/Deploy rules/],
  });
  const system = result.blocks.find((entry) => entry.kind === "system_instruction");

  assert.ok(system);
  assert.match(system.content, /^<system-reminder>/);
  assert.match(system.content, /`npm test`/);
  assert.match(system.content, /https:\/\/example\.com\/runbook/);
  assert.match(system.content, /MAX_RETRIES/);
  assert.match(system.content, /<\/system-reminder>$/);
  assert.equal(
    result.blocks.some((entry) => entry.kind === "custom"),
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
