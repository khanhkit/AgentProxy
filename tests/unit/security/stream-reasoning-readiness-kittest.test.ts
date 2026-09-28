import test from "node:test";
import assert from "node:assert/strict";

import {
  hasValuableContent,
  isKnownNonClaudeStreamPayload,
} from "../../../open-sse/utils/streamHelpers.ts";
import { FORMATS } from "../../../open-sse/translator/formats.ts";
import { validateResponseQuality } from "../../../open-sse/services/combo/validateQuality.ts";

function openAiChunk(delta: Record<string, unknown>, finishReason: unknown = null) {
  return {
    id: "chatcmpl-kittest-ready",
    object: "chat.completion.chunk",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function sseResponse(frames: Record<string, unknown>[]): Response {
  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

test("TC-SSE-READY-001 delta.reasoning alone establishes known non-Claude semantic readiness", () => {
  const chunk = openAiChunk({ reasoning: "kittest-reasoning" });

  assert.equal(
    hasValuableContent(chunk, FORMATS.OPENAI),
    true,
    "positive control: downstream valuable-content policy already recognizes delta.reasoning"
  );
  assert.equal(
    isKnownNonClaudeStreamPayload(chunk),
    true,
    "delta.reasoning must be recognized by the readiness/quality classifier"
  );
});

test("TC-SSE-READY-002 reasoning aliases have exact semantic-readiness parity", () => {
  const aliases = [
    ["reasoning", "reasoning-alias"],
    ["reasoning_content", "reasoning-content-alias"],
    ["reasoning_text", "reasoning-text-alias"],
  ] as const;

  const results = aliases.map(([field, value]) => {
    const chunk = openAiChunk({ [field]: value });
    return [field, isKnownNonClaudeStreamPayload(chunk)] as const;
  });

  assert.deepEqual(
    results,
    [
      ["reasoning", true],
      ["reasoning_content", true],
      ["reasoning_text", true],
    ],
    "all supported reasoning aliases must establish readiness equivalently"
  );
});

test("TC-SSE-READY-003 empty, role-only, and malformed OpenAI chunks remain non-semantic", () => {
  const cases = [
    openAiChunk({ reasoning: "" }),
    openAiChunk({ role: "assistant" }),
    openAiChunk({}),
    { object: "chat.completion.chunk", choices: [{ index: 0, finish_reason: null }] },
  ];

  for (const chunk of cases) {
    assert.equal(
      isKnownNonClaudeStreamPayload(chunk),
      false,
      `non-semantic chunk must not establish readiness: ${JSON.stringify(chunk)}`
    );
  }
});

test("TC-SSE-READY-004 reasoning-only SSE passes streaming quality gate and replays intact", async () => {
  const reasoning = openAiChunk({ reasoning: "kittest-reasoning" });
  const terminal = openAiChunk({}, "stop");
  const response = sseResponse([reasoning, terminal]);

  const result = await validateResponseQuality(response, true, { warn: () => {} });

  assert.equal(
    result.valid,
    true,
    `reasoning-only SSE must not be classified as an empty completion: ${result.reason ?? "no reason"}`
  );
  assert.ok(result.clonedResponse, "valid streaming quality result must return a replayable response");

  const replayed = await result.clonedResponse.text();
  assert.match(replayed, /kittest-reasoning/, "reasoning bytes must survive bounded-peek replay");
  assert.match(replayed, /finish_reason[^\n]*stop/, "terminal chunk must survive bounded-peek replay");
  assert.match(replayed, /data: \[DONE\]/, "DONE marker must survive bounded-peek replay");
});
