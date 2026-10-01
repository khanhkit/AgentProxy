import test from "node:test";
import assert from "node:assert/strict";
import { stripUnsupportedParams } from "../../open-sse/translator/paramSupport.ts";

test("#12585: codex strips temperature/top_p provider-wide", () => {
  const body: Record<string, unknown> = { temperature: 0.7, top_p: 0.9, input: [] };
  stripUnsupportedParams("codex", "gpt-5.6-sol-xhigh", body);
  assert.equal(body.temperature, undefined);
  assert.equal(body.top_p, undefined);
  assert.ok(Array.isArray(body.input));
});

test("#12585: non-codex providers keep the same sampling params", () => {
  const body: Record<string, unknown> = { temperature: 0.7, top_p: 0.9 };
  stripUnsupportedParams("openai", "gpt-5.6-sol-xhigh", body);
  assert.equal(body.temperature, 0.7);
  assert.equal(body.top_p, 0.9);
});
