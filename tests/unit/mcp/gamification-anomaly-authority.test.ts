import assert from "node:assert/strict";
import test from "node:test";

import { gamificationTools } from "../../../open-sse/mcp-server/tools/gamificationTools.ts";

type ToolExtra = {
  authInfo?: {
    clientId?: string;
    scopes?: string[];
  };
};

type ToolHandler = (
  args: Record<string, unknown>,
  extra?: ToolExtra
) => Promise<Record<string, unknown>>;

function anomalyTool(): ToolHandler {
  const found = gamificationTools.find((entry) => entry.name === "gamification_anomalies");
  assert.ok(found, "missing gamification_anomalies MCP tool");
  return found.handler as ToolHandler;
}

function auth(scopes: string[]): ToolExtra {
  return { authInfo: { clientId: "ap-iss-0019-caller", scopes } };
}

test("AP-ISS-0019 denies population-wide anomalies to read-only authenticated callers", async () => {
  for (const scopes of [["read:gamification"], ["read:*"]]) {
    await assert.rejects(
      anomalyTool()({}, auth(scopes)),
      /manage|admin/i,
      `${scopes.join(",")} must not grant population-wide anomaly access`
    );
  }
});

test("AP-ISS-0019 allows explicit management/admin/full authority", async () => {
  for (const scopes of [
    ["read:gamification", "manage"],
    ["read:gamification", "admin"],
    ["*"],
  ]) {
    await assert.doesNotReject(anomalyTool()({}, auth(scopes)));
  }
});

test("AP-ISS-0019 preserves stdio/local-operator compatibility", async () => {
  await assert.doesNotReject(anomalyTool()({}));
});
