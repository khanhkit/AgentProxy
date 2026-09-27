import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCavemanOutputMode,
  placeSystemInstruction,
} from "../../open-sse/services/compression/outputMode.ts";
import {
  applyOutputStyles,
  OUTPUT_STYLE_MARKER,
} from "../../open-sse/services/compression/outputStyles/apply.ts";
import {
  injectCustomSystemPrompt,
  injectSystemPrompt,
  setSystemPromptConfig,
} from "../../open-sse/services/systemPrompt.ts";

test("generic placement never creates messages[0] system for a user-first body", () => {
  const placed = placeSystemInstruction(
    [{ role: "user", content: "hi" }],
    undefined,
    "be terse"
  );
  assert.equal(placed.messages?.[0]?.role, "user");
  assert.equal(placed.messages?.at(-1)?.role, "system");
});

test("output styles use top-level Anthropic system and remain idempotent", () => {
  const once = applyOutputStyles(
    { system: "You are Claude Code.", messages: [{ role: "user", content: "hi" }] },
    [{ id: "terse-prose", level: "full" }]
  );
  assert.equal(once.applied, true);
  assert.equal(once.body.messages?.[0]?.role, "user");
  assert.ok(String(once.body.system).includes(OUTPUT_STYLE_MARKER));

  const twice = applyOutputStyles(once.body, [{ id: "terse-prose", level: "full" }]);
  assert.equal(twice.applied, false);
  assert.equal(twice.skippedReason, "already_applied");
});

test("caveman appends to Anthropic system block arrays", () => {
  const result = applyCavemanOutputMode(
    {
      system: [{ type: "text", text: "base" }],
      messages: [{ role: "user", content: "hi" }],
    },
    { enabled: true, intensity: "full", autoClarity: true }
  );
  assert.equal(result.applied, true);
  assert.equal(result.body.messages?.[0]?.role, "user");
  assert.equal((result.body.system as unknown[]).length, 2);
});

test("global/custom system prompt normalize malformed top-level system without leaking into messages", () => {
  setSystemPromptConfig({ enabled: true, prefixPrompt: "PRE", suffixPrompt: "SUF" });
  const global = injectSystemPrompt({
    system: null,
    messages: [{ role: "user", content: "hi" }],
  });
  assert.equal(global.messages[0].role, "user");
  assert.ok(String(global.system).includes("PRE"));
  assert.ok(String(global.system).includes("SUF"));

  const custom = injectCustomSystemPrompt(
    { system: null, messages: [{ role: "user", content: "hi" }] },
    "CUSTOM"
  );
  assert.equal(custom.messages[0].role, "user");
  assert.equal(custom.system, "CUSTOM");

  setSystemPromptConfig({ enabled: false, prefixPrompt: "", suffixPrompt: "" });
});
