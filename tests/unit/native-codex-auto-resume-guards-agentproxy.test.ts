import test from "node:test";
import assert from "node:assert/strict";

const {
  MAX_AUTORESUMES_PER_TURN,
  hasProviderSpecificUnsafeContinuationState,
  hasUnresolvedToolCalls,
} = await import("../../open-sse/services/combo/nativeCodexTurnPin.ts");

test("native Codex auto-resume is bounded to one model switch", () => {
  assert.equal(MAX_AUTORESUMES_PER_TURN, 1);
});

test("tool call guard requires one matching output per call", () => {
  assert.equal(
    hasUnresolvedToolCalls({
      input: [
        { type: "function_call", call_id: "c1", name: "read", arguments: "{}" },
        { type: "function_call_output", call_id: "c1", output: "ok" },
      ],
    }),
    false
  );
  assert.equal(
    hasUnresolvedToolCalls({
      input: [{ type: "function_call", call_id: "c1", name: "read", arguments: "{}" }],
    }),
    true
  );
  assert.equal(
    hasUnresolvedToolCalls({
      messages: [
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "bash" }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] },
      ],
    }),
    false
  );
});

test("provider-owned opaque continuation state blocks model switching", () => {
  assert.equal(
    hasProviderSpecificUnsafeContinuationState({
      input: [{ type: "message", role: "user", content: "hello" }],
    }),
    false
  );
  assert.equal(
    hasProviderSpecificUnsafeContinuationState({
      previous_response_id: "resp_123",
      input: [{ type: "message", role: "user", content: "hello" }],
    }),
    true
  );
  assert.equal(
    hasProviderSpecificUnsafeContinuationState({
      input: [
        {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "x", thought_signature: "opaque" }],
        },
      ],
    }),
    true
  );
});
