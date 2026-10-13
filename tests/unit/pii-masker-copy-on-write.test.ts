import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GuardrailContext } from "../../src/lib/guardrails/base";

// The masker used to JSON round-trip every request body before looking at a
// single string, and resolved its feature flag once per string leaf. It now
// resolves the flag once per payload and copies only the containers it
// rewrites, so the caller's body is never mutated and non-JSON values the
// pipeline attaches to it (a tool-name Map, for example) survive.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-test-pii-masker-cow-"));
process.env.DATA_DIR = tmpDir;
delete process.env.PII_REDACTION_ENABLED;

const { clearAllFeatureFlagOverrides } = await import("../../src/lib/db/featureFlags.ts");
const { PIIMaskerGuardrail } = await import("../../src/lib/guardrails/piiMasker.ts");

const CONTEXT = {} as GuardrailContext;
const guardrail = new PIIMaskerGuardrail();
const SSN = "123-45-6789";

function buildBody() {
  const toolNameMap = new Map([["alias", "real_tool"]]);
  return {
    model: "test-model",
    _toolNameMap: toolNameMap,
    system: [{ type: "text", text: "You are helpful." }],
    messages: [
      { role: "user", content: [{ type: "text", text: `my ssn is ${SSN}` }] },
      { role: "assistant", content: "ok" },
    ],
  };
}

test("PII masker guardrail", async (t) => {
  await t.test("does not clone or modify the payload when request masking is off", async () => {
    clearAllFeatureFlagOverrides();
    const body = buildBody();
    const result = await guardrail.preCall(body, CONTEXT);
    assert.equal(result.block, false);
    assert.equal((result as { modifiedPayload?: unknown }).modifiedPayload, undefined);
    assert.ok(result.meta && (result.meta as { detections: number }).detections >= 1);
    assert.equal(
      (body.messages[0].content[0] as { text: string }).text,
      `my ssn is ${SSN}`,
      "the original body is untouched"
    );
  });

  await t.test("masks into a copy and keeps non-JSON values when masking is on", async () => {
    process.env.PII_REDACTION_ENABLED = "true";
    try {
      const body = buildBody();
      const result = await guardrail.preCall(body, CONTEXT);
      const out = (result as { modifiedPayload?: typeof body }).modifiedPayload;
      assert.ok(out, "a masked payload is returned");
      assert.notStrictEqual(out, body);
      const masked = (out.messages[0].content[0] as { text: string }).text;
      assert.ok(!masked.includes(SSN), `ssn must be masked, got: ${masked}`);
      assert.equal(
        (body.messages[0].content[0] as { text: string }).text,
        `my ssn is ${SSN}`,
        "the original body is never mutated"
      );
      assert.ok(out._toolNameMap instanceof Map, "pipeline metadata survives masking");
    } finally {
      delete process.env.PII_REDACTION_ENABLED;
    }
  });
});

test("PII post-call sanitizes circular and BigInt provider responses without failing open", async () => {
  const responseContext = {
    runtimeFeatureFlagOverrides: {
      PII_RESPONSE_SANITIZATION: "true",
      PII_RESPONSE_SANITIZATION_MODE: "redact",
    },
  } as GuardrailContext;
  const circular: Record<string, unknown> = { content: `my ssn is ${SSN}` };
  circular.self = circular;

  const circularResult = await guardrail.postCall(circular, responseContext);
  assert.equal(circularResult.block, false);
  const circularOut = circularResult.modifiedResponse as Record<string, unknown>;
  assert.ok(circularOut, "a sanitized circular response is returned");
  assert.equal(circularOut.content, "my ssn is [SSN_REDACTED]");
  assert.equal(circularOut.self, "[CIRCULAR_REFERENCE_REDACTED]");
  assert.equal(circular.content, `my ssn is ${SSN}`, "the original circular response is untouched");
  assert.equal(circular.self, circular);

  const bigintResponse = { content: `my ssn is ${SSN}`, usage: 1n };
  const bigintResult = await guardrail.postCall(bigintResponse, responseContext);
  assert.equal(bigintResult.block, false);
  const bigintOut = bigintResult.modifiedResponse as typeof bigintResponse;
  assert.ok(bigintOut, "a sanitized BigInt response is returned");
  assert.equal(bigintOut.content, "my ssn is [SSN_REDACTED]");
  assert.equal(bigintOut.usage, 1n);
  assert.equal(
    bigintResponse.content,
    `my ssn is ${SSN}`,
    "the original BigInt response is untouched"
  );

  const uncloneable = {
    content: `my ssn is ${SSN}`,
    toJSON() {
      throw new Error("provider toJSON failure");
    },
  };
  const uncloneableResult = await guardrail.postCall(uncloneable, responseContext);
  assert.equal(uncloneableResult.block, true);
  assert.equal(uncloneableResult.message, "Unable to sanitize provider response");

  const tooDeep: Record<string, unknown> = { usage: 1n };
  let cursor = tooDeep;
  for (let depth = 0; depth < 102; depth++) {
    const next: Record<string, unknown> = {};
    cursor.nested = next;
    cursor = next;
  }
  cursor.content = `my ssn is ${SSN}`;
  const tooDeepResult = await guardrail.postCall(tooDeep, responseContext);
  assert.equal(tooDeepResult.block, true);
  assert.equal(tooDeepResult.message, "Unable to sanitize provider response");
});
