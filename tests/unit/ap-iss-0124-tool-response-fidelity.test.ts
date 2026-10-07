import test from "node:test";
import assert from "node:assert/strict";

import { geminiToOpenAIRequest } from "../../open-sse/translator/request/gemini-to-openai.ts";
import { antigravityToOpenAIRequest } from "../../open-sse/translator/request/antigravity-to-openai.ts";
import { openaiToCloudCodeGeminiRequest } from "../../open-sse/translator/request/openai-to-gemini.ts";
import { openaiResponsesToOpenAIRequest } from "../../open-sse/translator/request/openai-responses.ts";
import { convertGeminiToInternal } from "../../src/app/api/v1beta/models/[...path]/convertGeminiToInternal.ts";

type Message = {
  role: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
};

const call = (name: string, args: Record<string, unknown>) => ({ functionCall: { name, args } });
const reply = (name: string, result: unknown) => ({
  functionResponse: { name, response: { result } },
});

function collectPairs(messages: Message[]) {
  const callIds = messages.flatMap((m) => m.tool_calls?.map((c) => c.id) ?? []);
  const results = messages
    .filter((m) => m.role === "tool")
    .map((m) => ({ id: m.tool_call_id, content: m.content }));
  return { callIds, results };
}

const converters: Array<[string, (contents: unknown[]) => Message[]]> = [
  [
    "gemini-to-openai",
    (contents) => geminiToOpenAIRequest("gpt-4o", { contents }, false).messages as Message[],
  ],
  [
    "antigravity-to-openai",
    (contents) =>
      antigravityToOpenAIRequest("gpt-4o", { request: { contents } }, false).messages as Message[],
  ],
  [
    "v1beta-converter",
    (contents) =>
      convertGeminiToInternal({ contents }, "openai/gpt-4o", false).messages as Message[],
  ],
];

for (const [label, convert] of converters) {
  test(`AP-ISS-0124 ${label}: id-less Gemini responses pair with generated call ids in order`, () => {
    const messages = convert([
      {
        role: "model",
        parts: [call("read_file", { path: "a" }), call("read_file", { path: "b" })],
      },
      {
        role: "user",
        parts: [reply("read_file", "A"), reply("read_file", "B")],
      },
    ]);
    const { callIds, results } = collectPairs(messages);
    assert.equal(callIds.length, 2);
    assert.deepEqual(results, [
      { id: callIds[0], content: '"A"' },
      { id: callIds[1], content: '"B"' },
    ]);
  });

  test(`AP-ISS-0124 ${label}: a later retry cannot consume an earlier unanswered call`, () => {
    const messages = convert([
      { role: "model", parts: [call("get_weather", { city: "Tokyo" })] },
      { role: "user", parts: [{ text: "retry Paris" }] },
      { role: "model", parts: [call("get_weather", { city: "Paris" })] },
      { role: "user", parts: [reply("get_weather", "14C")] },
    ]);
    const parisCall = messages
      .flatMap((m) => m.tool_calls ?? [])
      .find((c) => JSON.parse(c.function.arguments).city === "Paris");
    assert.ok(parisCall);
    assert.deepEqual(collectPairs(messages).results, [{ id: parisCall.id, content: '"14C"' }]);
  });
}

test("AP-ISS-0124 OpenAI -> Gemini keeps reused tool_call_id scoped to its turn", () => {
  const result = openaiToCloudCodeGeminiRequest(
    "gemini-3.8-flash-high",
    {
      messages: [
        { role: "user", content: "read file" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_collision_123",
              type: "function",
              function: { name: "read_file", arguments: '{"path":"a.txt"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_collision_123", content: "file content from turn 1" },
        { role: "user", content: "now run terminal command" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_collision_123",
              type: "function",
              function: { name: "run_terminal_command", arguments: '{"command":"ls"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_collision_123", content: "terminal output from turn 2" },
        { role: "user", content: "done" },
      ],
    },
    false
  ) as {
    contents: Array<{
      parts?: Array<{
        functionResponse?: { name?: string; response?: { result?: unknown } };
      }>;
    }>;
  };

  const responses = result.contents
    .flatMap((content) => content.parts ?? [])
    .flatMap((part) => (part.functionResponse ? [part.functionResponse] : []));

  assert.deepEqual(
    responses.map((response) => [response.name, response.response?.result]),
    [
      ["read_file", "file content from turn 1"],
      ["run_terminal_command", "terminal output from turn 2"],
    ]
  );
});

const IMAGE = `data:image/png;base64,${"A".repeat(32)}`;

function translateResponses(input: unknown[]): Record<string, unknown>[] {
  const out = openaiResponsesToOpenAIRequest("gpt-5.2", { input }, false, {}) as Record<
    string,
    unknown
  >;
  return out.messages as Record<string, unknown>[];
}

test("AP-ISS-0124 Responses function_call_output image is lifted after text-only tool result", () => {
  const messages = translateResponses([
    { type: "function_call", call_id: "call_img", name: "view_image", arguments: "{}" },
    {
      type: "function_call_output",
      call_id: "call_img",
      output: [
        { type: "input_text", text: "loaded" },
        { type: "input_image", image_url: IMAGE, detail: "high" },
      ],
    },
  ]);

  const toolIdx = messages.findIndex((m) => m.role === "tool");
  assert.ok(toolIdx >= 0);
  assert.match(messages[toolIdx].content as string, /loaded/);
  assert.match(messages[toolIdx].content as string, /Image omitted/);
  assert.deepEqual(messages[toolIdx + 1], {
    role: "user",
    content: [{ type: "image_url", image_url: { url: IMAGE, detail: "high" } }],
  });
});

test("AP-ISS-0124 Responses custom tool output and role-tool images use the same lifting path", () => {
  const custom = translateResponses([
    { type: "custom_tool_call", call_id: "call_custom", name: "shot", input: "{}" },
    {
      type: "custom_tool_call_output",
      call_id: "call_custom",
      output: [{ type: "input_image", image_url: IMAGE }],
    },
  ]);
  const customTool = custom.findIndex((m) => m.role === "tool");
  assert.deepEqual(custom[customTool + 1], {
    role: "user",
    content: [{ type: "image_url", image_url: { url: IMAGE } }],
  });

  const roleTool = translateResponses([
    { type: "function_call", call_id: "call_role", name: "shot", arguments: "{}" },
    {
      type: "message",
      role: "tool",
      tool_call_id: "call_role",
      content: [{ type: "input_image", image_url: IMAGE }],
    },
  ]);
  const roleToolIdx = roleTool.findIndex((message) => message.role === "tool");
  assert.ok(roleToolIdx >= 0);
  assert.deepEqual(roleTool[roleToolIdx + 1], {
    role: "user",
    content: [{ type: "image_url", image_url: { url: IMAGE } }],
  });
});
