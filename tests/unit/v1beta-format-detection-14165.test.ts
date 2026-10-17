import test from "node:test";
import assert from "node:assert/strict";

const { detectFormatFromEndpoint, detectFormatFromUrl } =
  await import("../../open-sse/services/provider.ts");
const { convertGeminiToInternal } =
  await import("../../src/app/api/v1beta/models/[...path]/convertGeminiToInternal.ts");

test("#14165: converted openai body on /v1beta detects as openai", () => {
  const converted = {
    model: "gemini-3.8-flash",
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 1024,
    stream: true,
  };
  assert.equal(
    detectFormatFromEndpoint(converted, "/v1beta/models/gemini-3.8-flash:streamGenerateContent"),
    "openai"
  );
});

test("#14165: full v1beta URL detects converted body as openai", () => {
  const converted = {
    model: "gemini-3.8-flash",
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 1024,
  };
  assert.equal(
    detectFormatFromUrl(
      converted,
      "http://localhost:20128/v1beta/models/gemini-3.8-flash:generateContent?alt=sse"
    ),
    "openai"
  );
});

test("#14165: raw gemini body on /v1beta remains gemini", () => {
  const raw = {
    contents: [{ role: "user", parts: [{ text: "hi" }] }],
    generationConfig: { maxOutputTokens: 1024 },
  };
  assert.equal(
    detectFormatFromEndpoint(raw, "/v1beta/models/gemini-3.8-flash:streamGenerateContent"),
    "gemini"
  );
});

test("#14165: Gemini ingress conversion emits the OpenAI shape used by detection", () => {
  const out = convertGeminiToInternal(
    {
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      generationConfig: { maxOutputTokens: 1024 },
    },
    "gemini-3.8-flash",
    true
  );
  assert.ok(Array.isArray(out.messages));
  assert.equal(out.max_tokens, 1024);
  assert.equal(out.contents, undefined);
});

test("AP-ISS-0196: v1beta defers Responses bodies to structural detection", () => {
  assert.equal(
    detectFormatFromEndpoint(
      { model: "gpt-5", input: "hello", max_output_tokens: 64 },
      "/v1beta/models/gemini-3.8-flash:generateContent"
    ),
    "openai-responses"
  );
});

test("AP-ISS-0196: v1beta defers wrapped Antigravity bodies to structural detection", () => {
  assert.equal(
    detectFormatFromEndpoint(
      {
        userAgent: "antigravity",
        request: { contents: [{ role: "user", parts: [{ text: "hello" }] }] },
      },
      "/v1beta/models/gemini-3.8-flash:generateContent"
    ),
    "antigravity"
  );
});
