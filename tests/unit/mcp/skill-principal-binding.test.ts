import assert from "node:assert/strict";
import test from "node:test";

import { skillTools } from "../../../open-sse/mcp-server/tools/skillTools.ts";
import { skillRegistry } from "../../../src/lib/skills/registry.ts";
import { skillExecutor } from "../../../src/lib/skills/executor.ts";

type ToolExtra = { authInfo?: { clientId?: string; scopes?: string[] } };
type ToolHandler = (
  args: Record<string, unknown>,
  extra?: ToolExtra
) => Promise<Record<string, unknown>>;

const registry = skillRegistry;
const executor = skillExecutor;
const originals = {
  loadFromDatabase: registry.loadFromDatabase,
  list: registry.list,
  setEnabledById: registry.setEnabledById,
  execute: executor.execute,
  listExecutions: executor.listExecutions,
};

function handler(name: keyof typeof skillTools): ToolHandler {
  return skillTools[name].handler as unknown as ToolHandler;
}

function fakeSkill(owner: string) {
  return {
    id: "skill-1",
    apiKeyId: owner,
    name: "fixture-skill",
    version: "1.0.0",
    description: "fixture",
    schema: {},
    handler: "fixture",
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
    sessionId: null,
    input: {},
    output: { ok: true },
    status: "success",
    errorMessage: null,
    durationMs: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function installRecorders(subjects: unknown[]) {
  registry.loadFromDatabase = async (apiKeyId?: string) => {
    subjects.push(["load", apiKeyId]);
  };
  registry.list = (apiKeyId?: string) => {
    subjects.push(["list", apiKeyId]);
    return [fakeSkill(String(apiKeyId))];
  };
  registry.setEnabledById = async (_skillId: string, apiKeyId: string) => {
    subjects.push(["enable", apiKeyId]);
    return fakeSkill(apiKeyId);
  };
  executor.execute = async (
    _skillName: string,
    _input: Record<string, unknown>,
    context: { apiKeyId: string }
  ) => {
    subjects.push(["execute", context.apiKeyId]);
    return fakeExecution(context.apiKeyId);
  };
  executor.listExecutions = (apiKeyId?: string) => {
    subjects.push(["history", apiKeyId]);
    return [fakeExecution(String(apiKeyId))];
  };
}

async function exerciseAll(requestedId: string, extra?: ToolExtra) {
  await handler("agentproxy_skills_list")({ apiKeyId: requestedId }, extra);
  await handler("agentproxy_skills_enable")(
    { apiKeyId: requestedId, skillId: "skill-1", enabled: true },
    extra
  );
  await handler("agentproxy_skills_execute")(
    { apiKeyId: requestedId, skillName: "fixture-skill", input: {} },
    extra
  );
  await handler("agentproxy_skills_executions")({ apiKeyId: requestedId }, extra);
}

test.afterEach(() => {
  registry.loadFromDatabase = originals.loadFromDatabase;
  registry.list = originals.list;
  registry.setEnabledById = originals.setEnabledById;
  executor.execute = originals.execute;
  executor.listExecutions = originals.listExecutions;
});

test("manage-scope MCP callers may explicitly operate on a foreign skill tenant", async () => {
  const subjects: unknown[] = [];
  installRecorders(subjects);

  await exerciseAll("tenant-b", {
    authInfo: { clientId: "tenant-admin", scopes: ["manage"] },
  });

  assert.deepEqual(subjects, [
    ["load", "tenant-b"],
    ["list", "tenant-b"],
    ["load", "tenant-b"],
    ["enable", "tenant-b"],
    ["execute", "tenant-b"],
    ["history", "tenant-b"],
  ]);
});

test("stdio/local skill calls without per-request auth preserve the requested tenant", async () => {
  const subjects: unknown[] = [];
  installRecorders(subjects);

  await exerciseAll("local-tenant");

  assert.deepEqual(subjects, [
    ["load", "local-tenant"],
    ["list", "local-tenant"],
    ["load", "local-tenant"],
    ["enable", "local-tenant"],
    ["execute", "local-tenant"],
    ["history", "local-tenant"],
  ]);
});
