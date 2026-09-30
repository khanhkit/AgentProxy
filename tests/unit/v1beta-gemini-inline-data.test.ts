import test from "node:test";
import assert from "node:assert/strict";

const { convertGeminiToInternal } =
  await import("../../src/app/api/v1beta/models/[...path]/convertGeminiToInternal.ts");

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";

test("v1beta preserves inlineData next to user text", () => {
  const out = convertGeminiToInternal(
    {
      contents: [
        {
          role: "user",
          parts: [{ text: "describe" }, { inlineData: { mimeType: "image/png", data: PNG } }],
        },
      ],
    } as never,
    "gemini/gemini-2.5-flash",
    false
  );
  assert.deepEqual(out.messages, [
    {
      role: "user",
      content: [
        { type: "text", text: "describe" },
        { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } },
      ],
    },
  ]);
});

test("v1beta keeps colocated functionResponse and inlineData as separate messages", () => {
  const out = convertGeminiToInternal(
    {
      contents: [
        {
          role: "model",
          parts: [{ functionCall: { id: "call_a", name: "read_file", args: {} } }],
        },
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                id: "call_a",
                name: "read_file",
                response: { result: "ok" },
              },
            },
            { inlineData: { mimeType: "image/png", data: PNG } },
          ],
        },
      ],
    } as never,
    "gemini/gemini-2.5-flash",
    false
  );
  assert.deepEqual(out.messages.slice(1), [
    { role: "tool", tool_call_id: "call_a", content: '"ok"' },
    {
      role: "user",
      content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } }],
    },
  ]);
});

test("v1beta does not emit assistant inlineData as image content", () => {
  const out = convertGeminiToInternal(
    {
      contents: [
        {
          role: "model",
          parts: [{ text: "done" }, { inlineData: { mimeType: "image/png", data: PNG } }],
        },
      ],
    } as never,
    "gemini/gemini-2.5-flash",
    false
  );
  assert.deepEqual(out.messages, [{ role: "assistant", content: "done" }]);
});
