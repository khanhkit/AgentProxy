import test from "node:test";
import assert from "node:assert/strict";

const { createRequestLogger } = await import("../../open-sse/utils/requestLogger.ts");
const { protectPayloadForLog } = await import("../../src/lib/logPayloads.ts");

async function loggedHeader(name: string, value: string) {
  const logger = await createRequestLogger("openai", "test-provider", "test-model", {});
  logger.logTargetRequest("https://example.test/v1", { [name]: value }, {});
  const payload = logger.getPipelinePayloads();
  return (payload?.providerRequest?.headers as Record<string, unknown>)[name];
}

for (const [name, value] of [
  ["x-goog-api-key", "super-secret-gemini-key-12345"],
  ["api-key", "azure-secret-key-67890"],
  ["xi-api-key", "elevenlabs-secret-key-abcde"],
  ["x-api-key", "anthropic-secret-key-xyz"],
] as const) {
  test(`#13273: request logger masks ${name}`, async () => {
    const logged = await loggedHeader(name, value);
    assert.notEqual(logged, value);
    assert.equal(typeof logged, "string");
  });
}

test("#13273: x-ratelimit headers remain visible", async () => {
  const logged = await loggedHeader("x-ratelimit-remaining-requests", "100");
  assert.equal(logged, "100");
});

test("#13273: protectPayloadForLog redacts xi-api-key", () => {
  const protectedPayload = protectPayloadForLog({
    headers: { "xi-api-key": "elevenlabs-secret-key-abcde" },
  }) as Record<string, unknown>;
  assert.equal(
    (protectedPayload.headers as Record<string, unknown>)["xi-api-key"],
    "[REDACTED]"
  );
});

test("#13273: protectPayloadForLog still redacts x-goog-api-key", () => {
  const protectedPayload = protectPayloadForLog({
    headers: { "x-goog-api-key": "gemini-secret-key" },
  }) as Record<string, unknown>;
  assert.equal(
    (protectedPayload.headers as Record<string, unknown>)["x-goog-api-key"],
    "[REDACTED]"
  );
});
