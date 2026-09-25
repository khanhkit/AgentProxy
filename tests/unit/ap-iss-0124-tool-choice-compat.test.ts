import test from "node:test";
import assert from "node:assert/strict";

import { claudeToOpenAIRequest } from "../../open-sse/translator/request/claude-to-openai.ts";
import { openaiToClaudeRequest } from "../../open-sse/translator/request/openai-to-claude.ts";
import { openaiResponsesToOpenAIRequest } from "../../open-sse/translator/request/openai-responses.ts";
import { translateNonStreamingClientResponse } from "../../open-sse/handlers/chatCore/nonStreamingClientTranslate.ts";
import { FORMATS } from "../../open-sse/translator/formats.ts";

test("AP-ISS-0124: Claude tool_choice none stays disabled when translated to OpenAI", () => {
  const result = claudeToOpenAIRequest(
    "gpt-4o",
    {
      messages: [{ role: "user", content: "hello" }],
      tools: [{ name: "lookup", input_schema: { type: "object" } }],
      tool_choice: { type: "none" },
    },
    false
  );

  assert.equal(result.tool_choice, "none");
});

test("AP-ISS-0124: OpenAI tool_choice none stays disabled when translated to Claude", () => {
  const result = openaiToClaudeRequest(
    "claude-sonnet-4-20250514",
    {
      messages: [{ role: "user", content: "hello" }],
      tools: [
        {
          type: "function",
          function: {
            name: "lookup",
            description: "Lookup",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
      tool_choice: "none",
    },
    false
  );

  assert.deepEqual(result.tool_choice, { type: "none" });
});

test("AP-ISS-0124: Responses custom tool_choice forces the normalized Chat function", () => {
  const result = openaiResponsesToOpenAIRequest(
    "gpt-5.6-sol",
    {
      model: "gpt-5.6-sol",
      tools: [
        {
          type: "custom",
          name: "functions__exec",
          description: "Execute freeform code",
        },
      ],
      tool_choice: {
        type: "custom",
        name: "functions__exec",
      },
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "run it" }],
        },
      ],
      stream: false,
    },
    false,
    {}
  );

  assert.deepEqual(result.tool_choice, {
    type: "function",
    function: { name: "functions__exec" },
  });
});

test("AP-ISS-0124: non-streaming Responses client gets custom_tool_call with raw input", () => {
  const result = translateNonStreamingClientResponse({
    responseBody: {
      id: "chatcmpl-custom",
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "functions__exec",
                  arguments: JSON.stringify({ input: 'text("ok")' }),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    },
    responsePayloadFormat: FORMATS.OPENAI,
    clientResponseFormat: FORMATS.OPENAI_RESPONSES,
    sourceFormat: FORMATS.OPENAI_RESPONSES,
    provider: "openai",
    model: "gpt-5.6-sol",
    requestBody: {},
    responseToolNameMap: null,
    customToolNames: new Set(["functions__exec"]),
    requestToolIdentityMap: null,
    reasoningCacheScope: null,
    clientHeaders: null,
    isClaudeCodeCompatible: false,
    phase: "final",
  });

  const output = result.response.output;
  assert.ok(Array.isArray(output));
  const item = output.find((entry: Record<string, unknown>) => entry.name === "functions__exec");
  assert.ok(item);
  assert.equal(item.type, "custom_tool_call");
  assert.equal(item.input, 'text("ok")');
  assert.equal(item.arguments, undefined);
});
