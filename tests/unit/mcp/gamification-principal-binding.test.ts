import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, describe, it } from "node:test";

import { gamificationTools } from "../../../open-sse/mcp-server/tools/gamificationTools.ts";
import { addXp, getBalance } from "../../../src/lib/db/gamification.ts";
import { getDbInstance } from "../../../src/lib/db/core.ts";

type ToolExtra = {
  authInfo?: {
    clientId?: string;
    scopes?: string[];
  };
};

type ToolHandler = (args: Record<string, unknown>, extra?: ToolExtra) => Promise<Record<string, unknown>>;

const cleanupIds = new Set<string>();

function id(label: string): string {
  const value = `mcp-gamification-${label}-${randomUUID()}`;
  cleanupIds.add(value);
  return value;
}

function tool(name: string): ToolHandler {
  const found = gamificationTools.find((entry) => entry.name === name);
  assert.ok(found, `missing ${name}`);
  return found.handler as ToolHandler;
}

function extra(clientId: string, scopes: string[]): ToolExtra {
  return { authInfo: { clientId, scopes } };
}

afterEach(() => {
  const db = getDbInstance();
  for (const apiKeyId of cleanupIds) {
    db.prepare("DELETE FROM user_levels WHERE api_key_id = ?").run(apiKeyId);
    db.prepare("DELETE FROM xp_audit_log WHERE api_key_id = ?").run(apiKeyId);
    db.prepare("DELETE FROM token_ledger WHERE from_api_key_id = ? OR to_api_key_id = ?").run(
      apiKeyId,
      apiKeyId
    );
  }
  cleanupIds.clear();
});

describe("MCP gamification principal binding", () => {
  it("reads the authenticated caller profile instead of a foreign apiKeyId", async () => {
    const caller = id("caller");
    const foreign = id("foreign");
    addXp(caller, "request", 7);
    addXp(foreign, "request", 700);

    const result = await tool("gamification_profile")(
      { apiKeyId: foreign },
      extra(caller, ["read:gamification"])
    );

    assert.equal(result.totalXp, 7);
  });

  it("cannot debit a foreign balance when fromApiKeyId names another principal", async () => {
    const caller = id("caller");
    const foreign = id("foreign");
    const recipient = id("recipient");
    const db = getDbInstance();
    db.prepare(
      `INSERT INTO token_ledger (from_api_key_id, to_api_key_id, amount, reason, idempotency_key)
       VALUES (?, ?, ?, ?, ?)`
    ).run("system", foreign, 100, "test funding", randomUUID());

    const result = await tool("gamification_transfer")(
      { fromApiKeyId: foreign, toApiKeyId: recipient, amount: 25 },
      extra(caller, ["write:gamification"])
    );

    assert.equal(result.success, false);
    assert.equal(getBalance(foreign), 100);
    assert.equal(getBalance(recipient), 0);
  });

  it("allows an explicit foreign source for a management caller", async () => {
    const admin = id("admin");
    const foreign = id("foreign");
    const recipient = id("recipient");
    const db = getDbInstance();
    db.prepare(
      `INSERT INTO token_ledger (from_api_key_id, to_api_key_id, amount, reason, idempotency_key)
       VALUES (?, ?, ?, ?, ?)`
    ).run("system", foreign, 100, "test funding", randomUUID());

    const result = await tool("gamification_transfer")(
      { fromApiKeyId: foreign, toApiKeyId: recipient, amount: 25 },
      extra(admin, ["write:gamification", "manage"])
    );

    assert.equal(result.success, true);
    assert.equal(getBalance(foreign), 75);
    assert.equal(getBalance(recipient), 25);
  });

});
