import { z } from "zod";
import { skillRegistry } from "@/lib/skills/registry";
import { skillExecutor } from "@/lib/skills/executor";
import { hasManageScope } from "../../../src/shared/constants/managementScopes";
import type { McpToolExtraLike } from "../scopeEnforcement.ts";

function resolveSkillSubject(
  requestedId: string | undefined,
  extra?: McpToolExtraLike
): string | undefined {
  const callerId = extra?.authInfo?.clientId?.trim();
  if (!callerId || hasManageScope(extra?.authInfo?.scopes ?? [])) return requestedId;
  return callerId;
}

export const SkillListSchema = z.object({
  apiKeyId: z.string().optional(),
  name: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const SkillEnableSchema = z.object({
  apiKeyId: z.string(),
  skillId: z.string(),
  enabled: z.boolean(),
});

export const SkillExecuteSchema = z.object({
  apiKeyId: z.string(),
  skillName: z.string(),
  input: z.record(z.string(), z.unknown()),
  sessionId: z.string().optional(),
});

export const skillTools = {
  agentproxy_skills_list: {
    name: "agentproxy_skills_list",
    description: "List all registered skills with optional filtering by API key or name",
    scopes: ["read:skills"],
    inputSchema: SkillListSchema,
    handler: async (args: z.infer<typeof SkillListSchema>, extra?: McpToolExtraLike) => {
      const apiKeyId = resolveSkillSubject(args.apiKeyId, extra);
      await skillRegistry.loadFromDatabase(apiKeyId);
      const skills = skillRegistry.list(apiKeyId);

      let filtered = skills;
      if (args.name) {
        filtered = filtered.filter((s) => s.name.includes(args.name!));
      }
      if (args.enabled !== undefined) {
        filtered = filtered.filter((s) => s.enabled === args.enabled);
      }

      return {
        skills: filtered.map((s) => ({
          id: s.id,
          name: s.name,
          version: s.version,
          description: s.description,
          enabled: s.enabled,
          createdAt: s.createdAt.toISOString(),
        })),
        count: filtered.length,
      };
    },
  },

  agentproxy_skills_enable: {
    name: "agentproxy_skills_enable",
    description: "Enable or disable a specific skill by ID",
    scopes: ["write:skills"],
    inputSchema: SkillEnableSchema,
    handler: async (args: z.infer<typeof SkillEnableSchema>, extra?: McpToolExtraLike) => {
      const apiKeyId = resolveSkillSubject(args.apiKeyId, extra);
      await skillRegistry.loadFromDatabase(apiKeyId);
      const skill = await skillRegistry.setEnabledById(args.skillId, apiKeyId!, args.enabled);
      if (!skill) {
        throw new Error(`Skill not found: ${args.skillId}`);
      }

      return { success: true, skillId: args.skillId, enabled: args.enabled };
    },
  },

  agentproxy_skills_execute: {
    name: "agentproxy_skills_execute",
    description: "Execute a skill with provided input and return the result",
    scopes: ["execute:skills"],
    inputSchema: SkillExecuteSchema,
    handler: async (args: z.infer<typeof SkillExecuteSchema>, extra?: McpToolExtraLike) => {
      const apiKeyId = resolveSkillSubject(args.apiKeyId, extra);
      const execution = await skillExecutor.execute(args.skillName, args.input, {
        apiKeyId: apiKeyId!,
        sessionId: args.sessionId,
      });

      return {
        id: execution.id,
        skillId: execution.skillId,
        status: execution.status,
        output: execution.output,
        error: execution.errorMessage,
        duration: execution.durationMs,
        createdAt: execution.createdAt.toISOString(),
      };
    },
  },

  agentproxy_skills_executions: {
    name: "agentproxy_skills_executions",
    description: "List recent skill execution history",
    scopes: ["read:skills"],
    inputSchema: z.object({
      apiKeyId: z.string().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }),
    handler: async (args: { apiKeyId?: string; limit?: number }, extra?: McpToolExtraLike) => {
      const apiKeyId = resolveSkillSubject(args.apiKeyId, extra);
      const executions = skillExecutor.listExecutions(apiKeyId, args.limit || 50);

      return {
        executions: executions.map((e) => ({
          id: e.id,
          skillId: e.skillId,
          status: e.status,
          duration: e.durationMs,
          error: e.errorMessage,
          createdAt: e.createdAt.toISOString(),
        })),
        count: executions.length,
      };
    },
  },
};
