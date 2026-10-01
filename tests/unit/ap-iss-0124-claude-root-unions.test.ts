import test from "node:test";
import assert from "node:assert/strict";

import {
  hasRootLevelSchemaUnion,
  normalizeClaudeToolInputSchema,
  sanitizeClaudeToolSchema,
} from "../../open-sse/translator/helpers/schemaCoercion.ts";
import { openaiToClaudeRequest } from "../../open-sse/translator/request/openai-to-claude.ts";
import { buildClaudeCodeCompatibleRequest } from "../../open-sse/services/claudeCodeCompatible.ts";

type AnyRecord = Record<string, unknown>;

function assertNoRootUnion(schema: AnyRecord) {
  assert.equal(Object.prototype.hasOwnProperty.call(schema, "anyOf"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(schema, "oneOf"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(schema, "allOf"), false);
  assert.equal(schema.type, "object");
}

test("AP-ISS-0124 Claude root anyOf flattens without promoting alternative requirements", () => {
  const input = {
    anyOf: [
      { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
      { type: "object", properties: { b: { type: "integer" } }, required: ["b"] },
    ],
  };
  assert.equal(hasRootLevelSchemaUnion(input), true);
  const result = normalizeClaudeToolInputSchema(input) as AnyRecord;
  assertNoRootUnion(result);
  assert.deepEqual(result.properties, {
    a: { type: "string" },
    b: { type: "integer" },
  });
  assert.equal("required" in result, false);
  assert.deepEqual(input.anyOf[0].required, ["a"]);
});

test("AP-ISS-0124 Claude root allOf merges properties and required fields", () => {
  const result = normalizeClaudeToolInputSchema({
    type: "object",
    properties: { base: { type: "boolean" } },
    required: ["base"],
    allOf: [
      { properties: { a: { type: "string" } }, required: ["a"] },
      { properties: { b: { type: "integer" } }, required: ["a", "b"] },
    ],
  }) as AnyRecord;
  assertNoRootUnion(result);
  assert.deepEqual(Object.keys(result.properties as AnyRecord).sort(), ["a", "b", "base"]);
  assert.deepEqual(result.required, ["base", "a", "b"]);
});

test("AP-ISS-0124 nested Claude union is preserved", () => {
  const input = {
    type: "object",
    properties: {
      pin: { anyOf: [{ type: "boolean" }, { type: "object" }] },
    },
  };
  assert.equal(hasRootLevelSchemaUnion(input), false);
  assert.equal(normalizeClaudeToolInputSchema(input), input);
});

test("AP-ISS-0124 sanitizeClaudeToolSchema repairs then flattens root union", () => {
  const result = sanitizeClaudeToolSchema({
    type: "object",
    properties: { a: { type: "string", enum: { "0": "x", "1": "y" } } },
    oneOf: { "0": { type: "object", properties: { b: { type: "string" } } } },
  }) as AnyRecord;
  assertNoRootUnion(result);
  assert.deepEqual((result.properties as AnyRecord).b, { type: "string" });
});

test("AP-ISS-0124 OpenAI to Claude strips root union from tool input_schema", () => {
  const result = openaiToClaudeRequest(
    "claude-opus-5",
    {
      messages: [{ role: "user", content: "ok" }],
      max_tokens: 32,
      tools: [
        {
          type: "function",
          function: {
            name: "delegate",
            parameters: {
              type: "object",
              properties: { act: { type: "string" } },
              required: ["act"],
              anyOf: [{ properties: { delegationId: { type: "string" } } }],
            },
          },
        },
      ],
    },
    false
  ) as AnyRecord;
  const schema = ((result.tools as AnyRecord[])[0].input_schema ?? {}) as AnyRecord;
  assertNoRootUnion(schema);
  assert.deepEqual(Object.keys(schema.properties as AnyRecord).sort(), ["act", "delegationId"]);
  assert.deepEqual(schema.required, ["act"]);
});

test("AP-ISS-0124 Claude-Code-compatible bridge strips root allOf", () => {
  const body = buildClaudeCodeCompatibleRequest({
    model: "claude-opus-5",
    normalizedBody: {
      model: "claude-opus-5",
      messages: [{ role: "user", content: "ok" }],
      max_tokens: 32,
      tools: [
        {
          type: "function",
          function: {
            name: "bridge_tool",
            parameters: {
              type: "object",
              properties: { base: { type: "string" } },
              required: ["base"],
              allOf: [{ properties: { extra: { type: "string" } }, required: ["extra"] }],
            },
          },
        },
      ],
    },
  }) as AnyRecord;
  const schema = ((body.tools as AnyRecord[])[0].input_schema ?? {}) as AnyRecord;
  assertNoRootUnion(schema);
  assert.deepEqual(Object.keys(schema.properties as AnyRecord).sort(), ["base", "extra"]);
  assert.deepEqual(schema.required, ["base", "extra"]);
});
