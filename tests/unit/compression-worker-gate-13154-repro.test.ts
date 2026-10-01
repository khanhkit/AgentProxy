import test from "node:test";
import assert from "node:assert/strict";
import {
  isCompressionWorkerEligible,
  isStrictlySerializable,
} from "../../open-sse/services/compression/compressionWorkerProtocol.ts";
import type { CompressionConfig } from "../../open-sse/services/compression/types.ts";

const body = { model: "gpt-test", messages: [{ role: "user", content: "hi" }] };
const config = {
  enabled: true, defaultMode: "stacked", autoTriggerTokens: 1, cacheMinutes: 0,
  preserveSystemPrompt: true, stackedPipeline: [{ engine: "rtk" }, { engine: "caveman" }],
} as CompressionConfig;

test("#13154: worker gate accepts realistic options containing undefined", () => {
  const options = {
    model: "gpt-test", supportsVision: undefined, providerTransport: undefined,
    provider: undefined, imageTransportFidelity: undefined, sourceFormat: undefined,
    targetFormat: undefined, compressionStage: undefined, config,
  };
  assert.doesNotThrow(() => structuredClone({ body, mode: "stacked", options }));
  assert.equal(isCompressionWorkerEligible(body, "stacked", options), true);
});

test("#13154: structured-clone native values are eligible but unsafe values remain rejected", () => {
  for (const value of [undefined, new Date(), new Map([["k", 1]]), new Set([1]), /x/]) {
    assert.equal(isStrictlySerializable(value), true);
  }
  for (const value of [() => undefined, Symbol("x"), NaN, Infinity, new Map([["k", () => 1]])]) {
    assert.equal(isStrictlySerializable(value), false);
  }
  const shared = { value: 1 };
  assert.equal(isStrictlySerializable({ left: shared, right: shared }), true);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.equal(isStrictlySerializable(cyclic), false);
});
