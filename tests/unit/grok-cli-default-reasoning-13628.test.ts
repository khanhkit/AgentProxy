import test from "node:test";
import assert from "node:assert/strict";

import { grok_cliProvider } from "../../open-sse/config/providers/registry/grok-cli/index.ts";
import { GrokCliExecutor } from "../../open-sse/executors/grok-cli.ts";

test("Grok 4.5 and 4.6 advertise supported thinking efforts", () => {
  for (const modelId of ["grok-4.5", "grok-4.6"]) {
    const model = grok_cliProvider.models?.find((entry) => entry.id === modelId);
    assert.deepEqual(model?.supportedThinkingEfforts, ["low", "medium", "high"]);
  }
});

test("Grok 4.5 and 4.6 default reasoning effort when absent", () => {
  const executor = new GrokCliExecutor();
  for (const model of ["grok-4.5", "grok-4.6"]) {
    const out = executor.transformRequest(
      model,
      {
        model,
        input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }],
        reasoning: { summary: "auto" },
      },
      false,
      {} as never
    ) as Record<string, unknown>;

    assert.deepEqual(out.reasoning, { summary: "auto", effort: "high" });
  }
});

test("explicit off/none is not silently promoted to default", () => {
  const executor = new GrokCliExecutor();
  const out = executor.transformRequest(
    "grok-4.6",
    {
      model: "grok-4.6",
      input: [],
      reasoning: { effort: "none" },
    },
    false,
    {} as never
  ) as Record<string, unknown>;

  assert.equal("reasoning" in out, false);
});
