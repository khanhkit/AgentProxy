import test from "node:test";
import assert from "node:assert/strict";

import { cleanJSONSchemaForAntigravity } from "../../open-sse/translator/helpers/geminiHelper.ts";

type AnyRecord = Record<string, unknown>;

function cleanedProperties(input: AnyRecord): AnyRecord {
  const cleaned = cleanJSONSchemaForAntigravity(input) as AnyRecord;
  assert.equal(cleaned.type, "object");
  return cleaned.properties as AnyRecord;
}

test("AP-ISS-0124 Gemini sanitizer preserves property named properties", () => {
  const properties = cleanedProperties({
    type: "object",
    properties: {
      action: { type: "string" },
      properties: { type: "array", items: { type: "string" } },
    },
    required: ["action"],
  });

  assert.equal(properties.type, undefined);
  assert.deepEqual(properties.properties, { type: "array", items: { type: "string" } });
});

test("AP-ISS-0124 Gemini sanitizer preserves property named required", () => {
  const properties = cleanedProperties({
    type: "object",
    properties: {
      enabled: { type: "boolean" },
      required: { type: "boolean" },
    },
    required: ["enabled"],
  });

  assert.equal(properties.type, undefined);
  assert.deepEqual(properties.required, { type: "boolean" });
});

test("AP-ISS-0124 Gemini sanitizer preserves property names that collide with schema keywords", () => {
  const properties = cleanedProperties({
    type: "object",
    properties: {
      additionalProperties: { type: "string" },
      allOf: { type: "string" },
      anyOf: { type: "string" },
      oneOf: { type: "string" },
      enum: { type: "string" },
      pattern: { type: "string" },
      minLength: { type: "integer" },
    },
  });

  assert.deepEqual(Object.keys(properties).sort(), [
    "additionalProperties",
    "allOf",
    "anyOf",
    "enum",
    "minLength",
    "oneOf",
    "pattern",
  ]);
  for (const name of Object.keys(properties)) {
    assert.ok(properties[name] && typeof properties[name] === "object", name);
  }
});

test("AP-ISS-0124 Gemini sanitizer still normalizes keywords inside each property schema", () => {
  const properties = cleanedProperties({
    type: "object",
    properties: {
      config: {
        type: "object",
        additionalProperties: false,
        properties: {
          count: { type: "number", enum: [1, 2] },
          mode: { const: "fast" },
        },
      },
    },
  });

  const config = properties.config as AnyRecord;
  assert.equal("additionalProperties" in config, false);
  const nested = config.properties as AnyRecord;
  assert.equal("enum" in (nested.count as AnyRecord), false);
  assert.deepEqual((nested.mode as AnyRecord).enum, ["fast"]);
});
