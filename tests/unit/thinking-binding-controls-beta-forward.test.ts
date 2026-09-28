import test from "node:test";
import assert from "node:assert/strict";

const { ANTHROPIC_BETA_API_KEY, mergeClientAnthropicBeta, FORWARDABLE_CLIENT_BETAS } =
  await import("../../open-sse/config/anthropicHeaders.ts");

const BINDING_CONTROLS = "thinking-binding-controls-2026-08-01";
const DISPLAY_UPDATES = "thinking-display-updates-2026-08-18";

test("client-negotiated thinking betas remain forwardable", () => {
  assert.ok(FORWARDABLE_CLIENT_BETAS.includes(BINDING_CONTROLS));
  assert.ok(FORWARDABLE_CLIENT_BETAS.includes(DISPLAY_UPDATES));

  const out = mergeClientAnthropicBeta(
    ANTHROPIC_BETA_API_KEY,
    `${BINDING_CONTROLS},${DISPLAY_UPDATES}`
  );
  assert.ok(out.includes(BINDING_CONTROLS));
  assert.ok(out.includes(DISPLAY_UPDATES));
});

test("unknown client betas remain blocked", () => {
  const out = mergeClientAnthropicBeta(
    ANTHROPIC_BETA_API_KEY,
    "future-unknown-beta-2099-01-01"
  );
  assert.ok(!out.includes("future-unknown-beta"));
});
