import test from "node:test";
import assert from "node:assert/strict";

const { convertGeminiToInternal } =
  await import("../../src/app/api/v1beta/models/[...path]/convertGeminiToInternal.ts");
const { v1betaGeminiGenerateSchema } =
  await import("../../src/shared/validation/schemas/gemini.ts");
const { MAX_EMBEDDING_INLINE_ITEM_BYTES } =
  await import("../../src/shared/validation/schemas/apiV1.ts");

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

test("v1beta rejects a single inlineData blob larger than 8 MiB decoded", () => {
  const data = Buffer.alloc(MAX_EMBEDDING_INLINE_ITEM_BYTES + 1).toString("base64");
  const parsed = v1betaGeminiGenerateSchema.safeParse({
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/png", data } }] }],
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.issues.map((issue) => issue.message).join(" "), /8 MiB/i);
  }
});

test("v1beta rejects more than 16 MiB aggregate inline media", () => {
  const exactlyEightMiB = Buffer.alloc(MAX_EMBEDDING_INLINE_ITEM_BYTES).toString("base64");
  const parsed = v1betaGeminiGenerateSchema.safeParse({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: exactlyEightMiB } },
          { inline_data: { mime_type: "image/png", data: exactlyEightMiB } },
          { inlineData: { mimeType: "image/png", data: "AAAA" } },
        ],
      },
    ],
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.issues.map((issue) => issue.message).join(" "), /16 MiB/i);
  }
});

test("v1beta counts snake_case system_instruction inline media toward request limits", () => {
  const data = Buffer.alloc(MAX_EMBEDDING_INLINE_ITEM_BYTES + 1).toString("base64");
  const parsed = v1betaGeminiGenerateSchema.safeParse({
    contents: [{ role: "user", parts: [{ text: "hello" }] }],
    system_instruction: {
      parts: [{ inline_data: { mime_type: "image/png", data } }],
    },
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.match(parsed.error.issues.map((issue) => issue.message).join(" "), /8 MiB|16 MiB/i);
  }
});

test("v1beta still accepts bounded inlineData", () => {
  const parsed = v1betaGeminiGenerateSchema.safeParse({
    contents: [
      {
        role: "user",
        parts: [{ text: "describe" }, { inlineData: { mimeType: "image/png", data: PNG } }],
      },
    ],
  });
  assert.equal(parsed.success, true);
});
