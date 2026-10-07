import test from "node:test";
import assert from "node:assert/strict";
import { getUnsupportedParams } from "../../open-sse/config/providerRegistry.ts";

test("Moonshot K3 live aliases inherit canonical restrictions", () => {
  for (const modelId of ["k3", "k3-256k", "kimi-k3"]) {
    assert.equal(getUnsupportedParams("moonshot", modelId).includes("temperature"), true);
  }
});

test("Kimi Coding K3 ids remain provider-scoped", () => {
  for (const modelId of ["k3", "k3-256k"]) {
    assert.equal(getUnsupportedParams("kimi-coding", modelId).includes("temperature"), false);
  }
});
