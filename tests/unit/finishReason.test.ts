import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOpenAICompatibleFinishReason,
  normalizeOpenAICompatibleFinishReasonString,
} from "../../open-sse/utils/finishReason.ts";

// ── normalizeOpenAICompatibleFinishReason ──────────────────────────────────

test("standard OpenAI finish reasons pass through unchanged", () => {
  assert.equal(normalizeOpenAICompatibleFinishReason("stop"), "stop");
  assert.equal(normalizeOpenAICompatibleFinishReason("length"), "length");
  assert.equal(normalizeOpenAICompatibleFinishReason("tool_calls"), "tool_calls");
  assert.equal(normalizeOpenAICompatibleFinishReason("content_filter"), "content_filter");
  assert.equal(normalizeOpenAICompatibleFinishReason("function_call"), "function_call");
});

test("max_tokens normalizes to length", () => {
  assert.equal(normalizeOpenAICompatibleFinishReason("max_tokens"), "length");
  assert.equal(normalizeOpenAICompatibleFinishReason("MAX_TOKENS"), "length");
});

test("Gemini MALFORMED_RESPONSE maps to content_filter", () => {
  assert.equal(normalizeOpenAICompatibleFinishReason("MALFORMED_RESPONSE"), "content_filter");
  assert.equal(normalizeOpenAICompatibleFinishReason("malformed_response"), "content_filter");
});

test("all safety finish reasons map to content_filter", () => {
  const reasons = [
    "safety",
    "recitation",
    "blocklist",
    "prohibited_content",
    "content_filtered",
    "policy_violation",
    "malformed_response",
  ];
  for (const reason of reasons) {
    assert.equal(
      normalizeOpenAICompatibleFinishReason(reason),
      "content_filter",
      `${reason} should map to content_filter`
    );
  }
});

test("case-insensitive matching", () => {
  assert.equal(normalizeOpenAICompatibleFinishReason("STOP"), "stop");
  assert.equal(normalizeOpenAICompatibleFinishReason("Safety"), "content_filter");
  assert.equal(normalizeOpenAICompatibleFinishReason("MALFORMED_RESPONSE"), "content_filter");
});

test("Claude stop reasons map to exact OpenAI equivalents", () => {
  assert.equal(normalizeOpenAICompatibleFinishReason("end_turn"), "stop");
  assert.equal(normalizeOpenAICompatibleFinishReason("stop_sequence"), "stop");
  assert.equal(normalizeOpenAICompatibleFinishReason("pause_turn"), "stop");
  assert.equal(normalizeOpenAICompatibleFinishReason("tool_use"), "tool_calls");
  assert.equal(normalizeOpenAICompatibleFinishReason("refusal"), "content_filter");
  assert.equal(normalizeOpenAICompatibleFinishReason("model_context_window_exceeded"), "length");
  assert.equal(normalizeOpenAICompatibleFinishReason("END_TURN"), "stop");
  assert.equal(normalizeOpenAICompatibleFinishReason("Tool_Use"), "tool_calls");
});

test("abort finish reasons still pass through raw", () => {
  assert.equal(normalizeOpenAICompatibleFinishReason("malformed_function_call"), "malformed_function_call");
  assert.equal(normalizeOpenAICompatibleFinishReason("unexpected_tool_call"), "unexpected_tool_call");
});

test("unknown reason passes through as-is", () => {
  assert.equal(normalizeOpenAICompatibleFinishReason("some_new_reason"), "some_new_reason");
});

test("non-string input returns as-is", () => {
  assert.equal(normalizeOpenAICompatibleFinishReason(null), null);
  assert.equal(normalizeOpenAICompatibleFinishReason(undefined), undefined);
  assert.equal(normalizeOpenAICompatibleFinishReason(42), 42);
});

// ── normalizeOpenAICompatibleFinishReasonString ────────────────────────────

test("string variant returns normalized string", () => {
  assert.equal(normalizeOpenAICompatibleFinishReasonString("stop"), "stop");
  assert.equal(normalizeOpenAICompatibleFinishReasonString("malformed_response"), "content_filter");
});

test("non-string input returns fallback (default stop)", () => {
  assert.equal(normalizeOpenAICompatibleFinishReasonString(null), "stop");
  assert.equal(normalizeOpenAICompatibleFinishReasonString(undefined), "stop");
  assert.equal(normalizeOpenAICompatibleFinishReasonString(""), "stop");
});

test("custom fallback", () => {
  assert.equal(normalizeOpenAICompatibleFinishReasonString(null, "length"), "length");
});
