import test from "node:test";
import assert from "node:assert/strict";

const { FORWARDABLE_CLIENT_BETAS, mergeClientAnthropicBeta } =
  await import("../../open-sse/config/anthropicHeaders.ts");
const { DefaultExecutor } = await import("../../open-sse/executors/default.ts");

const AUTO_MODE_BETA = "dangerous-tool-use-2026-09-03";
const CLIENT_BETAS = `effort-2025-11-24,${AUTO_MODE_BETA}`;

test("#14312: auto-mode beta is allowlisted and merged", () => {
  assert.ok(FORWARDABLE_CLIENT_BETAS.includes(AUTO_MODE_BETA));
  const merged = mergeClientAnthropicBeta("claude-code-20250219", CLIENT_BETAS);
  assert.ok(merged.split(",").includes(AUTO_MODE_BETA));
  assert.equal(merged.split(",").filter((x) => x === AUTO_MODE_BETA).length, 1);
});

test("#14312: anthropic-compatible providers seed an allowlisted client beta header", () => {
  const executor = new DefaultExecutor("anthropic-compatible-thirdparty");
  const headers = executor.buildHeaders(
    { apiKey: "k", providerSpecificData: { baseUrl: "https://gateway.example/v1" } },
    true,
    { "anthropic-beta": `${CLIENT_BETAS},totally-made-up-2030-01-01` }
  ) as Record<string, string>;
  const forwarded = (headers["anthropic-beta"] ?? "").split(",");
  assert.ok(forwarded.includes(AUTO_MODE_BETA));
  assert.ok(forwarded.includes("effort-2025-11-24"));
  assert.ok(!forwarded.includes("totally-made-up-2030-01-01"));
});

test("#14312: compatible provider without client beta sends no invented header", () => {
  const executor = new DefaultExecutor("anthropic-compatible-thirdparty");
  const headers = executor.buildHeaders(
    { apiKey: "k", providerSpecificData: { baseUrl: "https://gateway.example/v1" } },
    true
  ) as Record<string, string>;
  assert.equal(headers["anthropic-beta"], undefined);
});

test("#14312: openai-compatible provider does not start receiving Anthropic betas", () => {
  const executor = new DefaultExecutor("openai-compatible-thirdparty");
  const headers = executor.buildHeaders(
    { apiKey: "k", providerSpecificData: { baseUrl: "https://gateway.example/v1" } },
    true,
    { "anthropic-beta": CLIENT_BETAS }
  ) as Record<string, string>;
  assert.equal(headers["anthropic-beta"], undefined);
});
