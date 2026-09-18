import assert from "node:assert/strict";
import test from "node:test";

import { skillTools } from "../../../open-sse/mcp-server/tools/skillTools.ts";
import { skillRegistry } from "../../../src/lib/skills/registry.ts";
import { skillExecutor } from "../../../src/lib/skills/executor.ts";

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

const registry = skillRegistry as any;
const executor = skillExecutor as any;
const originals = {
  loadFromDatabase: registry.loadFromDatabase,
  list: registry.list,
  setEnabledById: registry.setEnabledById,
  execute: executor.execute,
  listExecutions: executor.listExecutions,
};

function auth(clientId: string, scopes: string[]): ToolExtra {
  return { authInfo: { clientId, scopes } };
}

function handler(name: keyof typeof skillTools): ToolHandler {
  return skillTools[name].handler as unknown as ToolHandler;
}

function fakeSkill(owner: string) {
  return {
    id: "skill-1",
    apiKeyId: owner,
    name: "tenant-skill",
    version: "1.0.0",
    description: "fixture",
    schema: {},
    handler: "fixture-handler",
    enabled: true,
    mode: "on",
    tags: [],
    installCount: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function fakeExecution(owner: string) {
  return {
    id: "execution-1",
    skillId: "skill-1",
    apiKeyId: owner,
    sessionId: "session-1",
    input: { value: "probe" },
    output: { ok: true },
    status: "success",
    errorMessage: null,
    durationMs: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

test.afterEach(() => {
  registry.loadFromDatabase = originals.loadFromDatabase;
  registry.list = originals.list;
  registry.setEnabledById = originals.setEnabledById;
  executor.execute = originals.execute;
  executor.listExecutions = originals.listExecutions;
});

test("TC-MCP-SKILL-SEC-001 list foreign/omitted subject is rebound to authenticated tenant", async () => {
  const caller = "tenant-a";
  const foreign = "tenant-b";
  const loadSubjects: unknown[] = [];
  const listSubjects: unknown[] = [];

  registry.loadFromDatabase = async (apiKeyId?: string) => {
    loadSubjects.push(apiKeyId);
  };
  registry.list = (apiKeyId?: string) => {
    listSubjects.push(apiKeyId);
    return [fakeSkill(String(apiKeyId ?? "unscoped"))];
  };

  const run = handler("agentproxy_skills_list");
  await run({ apiKeyId: foreign }, auth(caller, ["read:skills"]));
  await run({}, auth(caller, ["read:skills"]));
  await run({ apiKeyId: caller }, auth(caller, ["read:skills"]));

  assert.deepEqual(loadSubjects, [caller, caller, caller]);
  assert.deepEqual(listSubjects, [caller, caller, caller]);
});

test("TC-MCP-SKILL-SEC-002 enable mutation owner is authenticated tenant", async () => {
  const caller = "tenant-a";
  const foreign = "tenant-b";
  const loadSubjects: unknown[] = [];
  const mutationOwners: unknown[] = [];

  registry.loadFromDatabase = async (apiKeyId?: string) => {
    loadSubjects.push(apiKeyId);
  };
  registry.setEnabledById = async (_skillId: string, apiKeyId: string) => {
    mutationOwners.push(apiKeyId);
    return fakeSkill(apiKeyId);
  };

  const run = handler("agentproxy_skills_enable");
  await run(
    { apiKeyId: foreign, skillId: "skill-b-1", enabled: false },
    auth(caller, ["write:skills"])
  );
  await run(
    { apiKeyId: caller, skillId: "skill-a-1", enabled: true },
    auth(caller, ["write:skills"])
  );

  assert.deepEqual(loadSubjects, [caller, caller]);
  assert.deepEqual(mutationOwners, [caller, caller]);
});

test("TC-MCP-SKILL-SEC-003 execution context principal is authenticated tenant", async () => {
  const caller = "tenant-a";
  const foreign = "tenant-b";
  const executionOwners: unknown[] = [];

  executor.execute = async (
    _skillName: string,
    _input: Record<string, unknown>,
    context: { apiKeyId: string }
  ) => {
    executionOwners.push(context.apiKeyId);
    return fakeExecution(context.apiKeyId);
  };

  const run = handler("agentproxy_skills_execute");
  await run(
    { apiKeyId: foreign, skillName: "tenant-skill", input: { value: "probe" } },
    auth(caller, ["execute:skills"])
  );
  await run(
    { apiKeyId: caller, skillName: "tenant-skill", input: { value: "probe" } },
    auth(caller, ["execute:skills"])
  );

  assert.deepEqual(executionOwners, [caller, caller]);
});

test("TC-MCP-SKILL-SEC-004 execution history foreign/omitted subject is rebound to authenticated tenant", async () => {
  const caller = "tenant-a";
  const foreign = "tenant-b";
  const historyCalls: Array<[unknown, unknown]> = [];

  executor.listExecutions = (apiKeyId?: string, limit?: number) => {
    historyCalls.push([apiKeyId, limit]);
    return [fakeExecution(String(apiKeyId ?? "unscoped"))];
  };

  const run = handler("agentproxy_skills_executions");
  await run({ apiKeyId: foreign, limit: 10 }, auth(caller, ["read:skills"]));
  await run({ limit: 10 }, auth(caller, ["read:skills"]));
  await run({ apiKeyId: caller, limit: 10 }, auth(caller, ["read:skills"]));

  assert.deepEqual(historyCalls, [
    [caller, 10],
    [caller, 10],
    [caller, 10],
  ]);
});
