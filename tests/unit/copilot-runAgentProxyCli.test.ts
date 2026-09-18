import test from "node:test";
import assert from "node:assert/strict";

test("runAgentProxyCli: missing command returns error", async () => {
  const { getCopilotTool } = await import("../../src/lib/copilot/tools.ts");
  const tool = getCopilotTool("runAgentProxyCli");
  assert.ok(tool);
  const result = await tool.handler({});
  assert.equal(result, "Please provide a command to execute.");
});

test("runAgentProxyCli: empty command returns error", async () => {
  const { getCopilotTool } = await import("../../src/lib/copilot/tools.ts");
  const tool = getCopilotTool("runAgentProxyCli");
  assert.ok(tool);
  const result = await tool.handler({ command: "" });
  assert.equal(result, "Please provide a command to execute.");
});

test("runAgentProxyCli: returns CLI-not-found when agentproxy unavailable", async () => {
  const { getCopilotTool } = await import("../../src/lib/copilot/tools.ts");
  const tool = getCopilotTool("runAgentProxyCli");
  assert.ok(tool);
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = "";
    const result = await tool.handler({ command: "health" });
    assert.ok(
      result.includes("agentproxy CLI not found in PATH"),
      `Expected CLI-not-found message, got: ${result}`
    );
  } finally {
    process.env.PATH = originalPath;
  }
});
