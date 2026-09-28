import test from "node:test";
import assert from "node:assert/strict";

const { openaiToGeminiRequest } =
  await import("../../open-sse/translator/request/openai-to-gemini.ts");
const { geminiToOpenAIResponse } =
  await import("../../open-sse/translator/response/gemini-to-openai.ts");
const { clearGeminiThoughtSignatures } =
  await import("../../open-sse/services/geminiThoughtSignatureStore.ts");

test.beforeEach(() => {
  clearGeminiThoughtSignatures();
});

test("AP-ISS-0060: strict Gemini round-trip replays reasoning_content with its authentic thoughtSignature", () => {
  const namespace = "conn-ap-iss-0060";
  const toolCallId = "call_reasoning_0060";
  const signature = "SIG_AP_ISS_0060_AUTHENTIC";
  const reasoning = "I should inspect the relevant source first.";

  const responseEvents = geminiToOpenAIResponse(
    {
      responseId: "resp-ap-iss-0060",
      modelVersion: "gemini-2.5-pro",
      candidates: [
        {
          content: {
            parts: [
              { thought: true, thoughtSignature: signature, text: reasoning },
              {
                functionCall: {
                  id: toolCallId,
                  name: "read_file",
                  args: { path: "src/index.ts" },
                },
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
    },
    { toolCalls: new Map(), signatureNamespace: namespace }
  );
  assert.match(JSON.stringify(responseEvents), /reasoning_content/);
  assert.match(JSON.stringify(responseEvents), new RegExp(toolCallId));

  // Simulate a standard OpenAI-compatible client echoing the assistant history
  // back on the next turn. The proprietary signature is intentionally absent from
  // the client payload; it must be recovered from the server-side cache above.
  const result = openaiToGeminiRequest(
    "gemini-2.5-pro",
    {
      messages: [
        { role: "user", content: "Inspect the repository." },
        {
          role: "assistant",
          reasoning_content: reasoning,
          content: "I will inspect it.",
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: { name: "read_file", arguments: '{"path":"src/index.ts"}' },
            },
          ],
        },
        { role: "tool", tool_call_id: toolCallId, content: "export const ok = true;" },
      ],
    },
    false,
    { _signatureNamespace: namespace },
    { signaturelessToolCallMode: "native" }
  );

  const modelTurn = result.contents.find((turn) => turn.role === "model");
  assert.ok(modelTurn, "expected model history turn");
  const thoughtPart = modelTurn.parts.find((part) => part.thought === true);
  assert.deepEqual(thoughtPart, {
    thought: true,
    text: reasoning,
    thoughtSignature: signature,
  });
  const functionCallPart = modelTurn.parts.find((part) => part.functionCall);
  assert.equal(functionCallPart?.thoughtSignature, signature);
});

test("AP-ISS-0060: strict Gemini never emits unsigned native historical reasoning on cache miss", () => {
  const result = openaiToGeminiRequest(
    "gemini-2.5-pro",
    {
      messages: [
        { role: "user", content: "Continue." },
        {
          role: "assistant",
          reasoning_content: "Unsigned historical reasoning must not become a native thought.",
          content: "Previous visible answer.",
        },
      ],
    },
    false
  );

  const modelTurn = result.contents.find((turn) => turn.role === "model");
  assert.ok(modelTurn, "expected model history turn");
  assert.equal(
    modelTurn.parts.some((part) => part.thought === true),
    false,
    "signature-requiring Gemini must not receive an unsigned native thought"
  );
  assert.ok(
    modelTurn.parts.some((part) => part.text === "Previous visible answer."),
    "visible assistant history must remain intact"
  );
});
