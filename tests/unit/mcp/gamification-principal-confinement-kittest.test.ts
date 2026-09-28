import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { gamificationTools } from "../../../open-sse/mcp-server/tools/gamificationTools.ts";
import { addXp, getBalance } from "../../../src/lib/db/gamification.ts";
import { getDbInstance } from "../../../src/lib/db/core.ts";

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

const cleanupIds = new Set<string>();

function principal(label: string): string {
  const value = `kittest-gamification-${label}-${randomUUID()}`;
  cleanupIds.add(value);
  return value;
}

function tool(name: string): ToolHandler {
  const found = gamificationTools.find((entry) => entry.name === name);
  assert.ok(found, `missing MCP gamification tool ${name}`);
  return found.handler as ToolHandler;
}

function auth(clientId: string, scopes: string[]): ToolExtra {
  return { authInfo: { clientId, scopes } };
}

function fund(apiKeyId: string, amount: number): void {
  getDbInstance()
    .prepare(
      `INSERT INTO token_ledger (from_api_key_id, to_api_key_id, amount, reason, idempotency_key)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run("system", apiKeyId, amount, "kittest funding", randomUUID());
}

function cleanup(): void {
  const db = getDbInstance();
  for (const apiKeyId of cleanupIds) {
    db.prepare("DELETE FROM user_badges WHERE api_key_id = ?").run(apiKeyId);
    db.prepare("DELETE FROM user_levels WHERE api_key_id = ?").run(apiKeyId);
    db.prepare("DELETE FROM xp_audit_log WHERE api_key_id = ?").run(apiKeyId);
    db.prepare("DELETE FROM token_ledger WHERE from_api_key_id = ? OR to_api_key_id = ?").run(
      apiKeyId,
      apiKeyId
    );
  }
  cleanupIds.clear();
}

test.afterEach(cleanup);
test.after(cleanup);

test("TC-MCP-GAME-SEC-001 non-management profile read is bound to authenticated caller", async () => {
  const caller = principal("caller");
  const foreign = principal("foreign");
  addXp(caller, "request", 7);
  addXp(foreign, "request", 700);

  const result = await tool("gamification_profile")(
    { apiKeyId: foreign },
    auth(caller, ["read:gamification"])
  );

  assert.equal(result.totalXp, 7, "profile must resolve to authenticated caller A");
  assert.notEqual(result.totalXp, 700, "profile must not expose foreign principal B");
});

test("TC-MCP-GAME-SEC-002 non-management transfer source is authenticated caller", async () => {
  const caller = principal("caller");
  const foreign = principal("foreign");
  const recipient = principal("recipient");
  fund(caller, 40);
  fund(foreign, 100);

  assert.equal(getBalance(caller), 40);
  assert.equal(getBalance(foreign), 100);
  assert.equal(getBalance(recipient), 0);

  const result = await tool("gamification_transfer")(
    { fromApiKeyId: foreign, toApiKeyId: recipient, amount: 25 },
    auth(caller, ["write:gamification"])
  );

  assert.equal(result.success, true, "caller A has enough balance for the effective transfer");
  assert.equal(getBalance(caller), 15, "authenticated caller A must be debited");
  assert.equal(getBalance(foreign), 100, "foreign principal B must remain unchanged");
  assert.equal(getBalance(recipient), 25, "recipient C must receive exactly 25 tokens");
});

// Retired from AP-ISS-0018 acceptance: AP-MCP-002 is requires-auth, while stdio/no-auth is documented operator-local explicit-ID compatibility.
test.skip("TC-MCP-GAME-SEC-003 missing authenticated principal does not trust caller-selected subject [TEST_DEFECT/NOT_APPLICABLE]", async () => {
  const foreign = principal("foreign");
  addXp(foreign, "request", 333);

  const result = await tool("gamification_profile")({ apiKeyId: foreign });

  assert.notEqual(
    result.totalXp,
    333,
    "without an authenticated principal or explicit management authority, caller-selected B must not be treated as an authorized subject"
  );
});

test("TC-MCP-GAME-SEC-005 read-only caller cannot read global anomaly data", async () => {
  const caller = principal("anomaly-read-only");

  await assert.rejects(
    tool("gamification_anomalies")({}, auth(caller, ["read:gamification"])),
    /manage|admin/i
  );
});

test("TC-MCP-GAME-SEC-006 management and admin authority may read global anomaly data", async () => {
  const manager = principal("anomaly-manager");
  const admin = principal("anomaly-admin");

  await assert.doesNotReject(
    tool("gamification_anomalies")({}, auth(manager, ["read:gamification", "manage"]))
  );
  await assert.doesNotReject(
    tool("gamification_anomalies")({}, auth(admin, ["read:gamification", "admin"]))
  );
});

test("TC-MCP-GAME-SEC-004 explicit management authority may select a foreign transfer source", async () => {
  const manager = principal("manager");
  const foreign = principal("foreign");
  const recipient = principal("recipient");
  fund(foreign, 100);

  const result = await tool("gamification_transfer")(
    { fromApiKeyId: foreign, toApiKeyId: recipient, amount: 25 },
    auth(manager, ["write:gamification", "manage"])
  );

  assert.equal(result.success, true, "explicit management authority may select foreign B");
  assert.equal(getBalance(foreign), 75);
  assert.equal(getBalance(recipient), 25);
});
