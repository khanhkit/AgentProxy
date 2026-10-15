import test from "node:test";
import assert from "node:assert/strict";

import { createChatPipelineHarness } from "./_chatPipelineHarness.ts";

test("chat pipeline harness reset clears payload-rule runtime overrides", async () => {
  const harness = await createChatPipelineHarness("payload-rule-reset");
  const payloadRules = await import("../../open-sse/services/payloadRules.ts");

  try {
    payloadRules.setPayloadRulesConfig({
      override: [{ models: [{ name: "gpt-*" }], params: { temperature: 0.9 } }],
    });
    assert.equal((await payloadRules.getPayloadRulesConfig()).override.length, 1);

    await harness.resetStorage();

    assert.deepEqual((await payloadRules.getPayloadRulesConfig()).override, []);
  } finally {
    await harness.cleanup();
  }
});
