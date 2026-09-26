import test from "node:test";
import assert from "node:assert/strict";

import { claudeToGeminiRequest } from "../../open-sse/translator/request/claude-to-gemini.ts";
import { claudeToOpenAIRequest } from "../../open-sse/translator/request/claude-to-openai.ts";

test("AP-ISS-0124: Claude stop sequences map to Gemini stopSequences", () => {
  const result = claudeToGeminiRequest(
    "gemini-2.5-pro",
    {
      messages: [{ role: "user", content: "hello" }],
      stop_sequences: ["END", "STOP"],
    },
    false
  );

  assert.deepEqual(result.generationConfig.stopSequences, ["END", "STOP"]);

  const legacyStop = claudeToGeminiRequest(
    "gemini-2.5-pro",
    {
      messages: [{ role: "user", content: "hello" }],
      stop: "HALT",
    },
    false
  );
  assert.deepEqual(legacyStop.generationConfig.stopSequences, ["HALT"]);
});

test("AP-ISS-0124: Claude HTTPS image maps to Gemini fileData", () => {
  const result = claudeToGeminiRequest(
    "gemini-2.5-pro",
    {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: "https://example.com/image.png" },
            },
          ],
        },
      ],
    },
    false
  );

  assert.deepEqual(result.contents[0].parts[0], {
    fileData: {
      fileUri: "https://example.com/image.png",
      mimeType: "image/*",
    },
  });
});

test("AP-ISS-0124: Claude tool_result HTTPS image stays attached for Gemini", () => {
  const result = claudeToGeminiRequest(
    "gemini-2.5-pro",
    {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_missing_signature",
              content: [
                {
                  type: "image",
                  source: { type: "url", url: "https://example.com/tool.png" },
                },
              ],
            },
          ],
        },
      ],
    },
    false
  );

  const parts = result.contents[0].parts;
  assert.ok(parts.some((part) => part.fileData?.fileUri === "https://example.com/tool.png"));
});

test("AP-ISS-0124: Claude tool_result URL image is lifted for OpenAI", () => {
  const result = claudeToOpenAIRequest(
    "gpt-4o",
    {
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "call_1",
              name: "read_image",
              input: {},
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call_1",
              content: [
                {
                  type: "image",
                  source: { type: "url", url: "https://example.com/tool.png" },
                },
              ],
            },
          ],
        },
      ],
    },
    false
  );

  const toolMessage = result.messages.find((message) => message.role === "tool");
  assert.ok(toolMessage);
  const imageMessage = result.messages.find(
    (message) =>
      message.role === "user" &&
      Array.isArray(message.content) &&
      message.content.some((part) => part?.type === "image_url")
  );
  assert.ok(imageMessage);
  assert.deepEqual(imageMessage.content, [
    {
      type: "image_url",
      image_url: { url: "https://example.com/tool.png" },
    },
  ]);
});
