import test from "node:test";
import assert from "node:assert/strict";
import { applyLiteCompression } from "../../open-sse/services/compression/lite.ts";

test("lite redundant-remove keeps distinct tool_call_id messages", () => {
  const result = applyLiteCompression({
    messages: [
      { role: "tool", tool_call_id: "c1", content: "" },
      { role: "tool", tool_call_id: "c2", content: "" },
    ],
  });

  const messages = (result.body as { messages: Array<Record<string, unknown>> }).messages;
  assert.deepEqual(
    messages.map((message) => message.tool_call_id),
    ["c1", "c2"]
  );
});

test("lite redundant-remove still collapses duplicate user messages", () => {
  const result = applyLiteCompression({
    messages: [
      { role: "user", content: "same" },
      { role: "user", content: "same" },
    ],
  });

  const messages = (result.body as { messages: Array<Record<string, unknown>> }).messages;
  assert.equal(messages.length, 1);
});
