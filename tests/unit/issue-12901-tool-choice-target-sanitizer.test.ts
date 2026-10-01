import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRequestForResolvedTarget } from "../../open-sse/services/targetRequestSanitizer.ts";

const opts = { provider: "skhynix", model: "DeepSeek-V4-Flash-0731" } as const;

test("#12901: strips tool_choice when tools are absent", () => {
  const input = { model: opts.model, messages: [], tool_choice: "auto" } as Record<string, unknown>;
  const out = sanitizeRequestForResolvedTarget(input, opts);
  assert.equal(Object.hasOwn(out, "tool_choice"), false);
  assert.equal(input.tool_choice, "auto", "caller body must remain untouched");
});

test("#12901: strips tool_choice when tools is an empty array", () => {
  const out = sanitizeRequestForResolvedTarget(
    { model: opts.model, messages: [], tools: [], tool_choice: "required" },
    opts
  );
  assert.equal(Object.hasOwn(out, "tool_choice"), false);
  assert.deepEqual(out.tools, []);
});

test("#12901: preserves tool_choice when usable tools exist", () => {
  const out = sanitizeRequestForResolvedTarget(
    {
      model: opts.model,
      messages: [],
      tools: [{ type: "function", function: { name: "lookup", parameters: {} } }],
      tool_choice: "auto",
    },
    opts
  );
  assert.equal(out.tool_choice, "auto");
});

test("#12901: leaves null tool_choice alone", () => {
  const out = sanitizeRequestForResolvedTarget(
    { model: opts.model, messages: [], tool_choice: null },
    opts
  );
  assert.equal(out.tool_choice, null);
});

test("#12901: guard is provider-agnostic", () => {
  for (const provider of ["openai", "nvidia", "deepseek", "skhynix"]) {
    const out = sanitizeRequestForResolvedTarget(
      { model: "any", messages: [], tool_choice: "required" },
      { provider, model: "any" }
    );
    assert.equal(Object.hasOwn(out, "tool_choice"), false, provider);
  }
});
