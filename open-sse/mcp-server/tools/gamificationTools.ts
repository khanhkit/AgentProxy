/**
 * MCP Gamification Tools — leaderboard, badges, levels, sharing.
 *
 * @module mcp-server/tools/gamificationTools
 */

import { z } from "zod";
import { hasManageScope } from "../../../src/shared/constants/managementScopes";
import type { McpToolExtraLike } from "../scopeEnforcement.ts";

function resolveGamificationSubject(requestedId: string, extra?: McpToolExtraLike): string {
  const callerId = extra?.authInfo?.clientId?.trim();
  if (!callerId || hasManageScope(extra?.authInfo?.scopes ?? [])) return requestedId;
  return callerId;
}

function requireGamificationAnomalyAuthority(extra?: McpToolExtraLike): void {
  const authInfo = extra?.authInfo;
  if (!authInfo) return;

  const scopes = authInfo.scopes ?? [];
  if (hasManageScope(scopes) || scopes.includes("*")) return;

  throw new Error("gamification_anomalies requires manage or admin authority");
}

export const gamificationTools = [
  {
    name: "gamification_leaderboard",
    description: "Get leaderboard rankings for a scope (global, weekly, monthly, tokens_shared).",
    scopes: ["read:gamification"],
    inputSchema: z.object({
      scope: z.enum(["global", "weekly", "monthly", "tokens_shared"]).default("global"),
      limit: z.number().min(1).max(100).default(50),
    }),
    handler: async (args: { scope: string; limit: number }) => {
      const { getTopN } = await import("../../../src/lib/gamification/leaderboard");
      const entries = await getTopN(args.scope as any, args.limit);
      return { entries };
    },
  },
  {
    name: "gamification_rank",
    description: "Get rank for an API key in a leaderboard scope.",
    scopes: ["read:gamification"],
    inputSchema: z.object({
      apiKeyId: z.string(),
      scope: z.enum(["global", "weekly", "monthly", "tokens_shared"]).default("global"),
    }),
    handler: async (args: { apiKeyId: string; scope: string }, extra?: McpToolExtraLike) => {
      const { getRank } = await import("../../../src/lib/gamification/leaderboard");
      const rank = await getRank(
        resolveGamificationSubject(args.apiKeyId, extra),
        args.scope as any
      );
      return { rank };
    },
  },
  {
    name: "gamification_profile",
    description: "Get XP, level, and badges for an API key.",
    scopes: ["read:gamification"],
    inputSchema: z.object({
      apiKeyId: z.string(),
    }),
    handler: async (args: { apiKeyId: string }, extra?: McpToolExtraLike) => {
      const apiKeyId = resolveGamificationSubject(args.apiKeyId, extra);
      const { getXp, getBadges } = await import("../../../src/lib/db/gamification");
      const { calculateLevel, getLevelTitle, getLevelTier } =
        await import("../../../src/lib/gamification/xp");
      const { getStreak } = await import("../../../src/lib/gamification/streaks");

      const xp = getXp(apiKeyId);
      const badges = getBadges(apiKeyId);
      const streak = await getStreak(apiKeyId);
      const level = xp ? calculateLevel(xp.totalXp) : 1;

      return {
        totalXp: xp?.totalXp || 0,
        level,
        title: getLevelTitle(level),
        tier: getLevelTier(level),
        streak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        badges: badges.map((b) => ({ id: b.badgeId, unlockedAt: b.unlockedAt })),
      };
    },
  },
  {
    name: "gamification_badges",
    description: "List all badge definitions or earned badges for an API key.",
    scopes: ["read:gamification"],
    inputSchema: z.object({
      apiKeyId: z.string().optional(),
      category: z.string().optional(),
    }),
    handler: async (args: { apiKeyId?: string; category?: string }, extra?: McpToolExtraLike) => {
      const { getBadgeDefinitions, getBadges } = await import("../../../src/lib/db/gamification");

      if (args.apiKeyId) {
        const badges = getBadges(resolveGamificationSubject(args.apiKeyId, extra));
        return { earned: badges };
      }

      const definitions = getBadgeDefinitions(args.category);
      return { definitions };
    },
  },
  {
    name: "gamification_transfer",
    description: "Transfer tokens between API keys.",
    scopes: ["write:gamification"],
    inputSchema: z.object({
      fromApiKeyId: z.string(),
      toApiKeyId: z.string(),
      amount: z.number().positive(),
      reason: z.string().optional(),
    }),
    handler: async (
      args: {
        fromApiKeyId: string;
        toApiKeyId: string;
        amount: number;
        reason?: string;
      },
      extra?: McpToolExtraLike
    ) => {
      const { transferTokens } = await import("../../../src/lib/gamification/sharing");
      const result = await transferTokens(
        resolveGamificationSubject(args.fromApiKeyId, extra),
        args.toApiKeyId,
        args.amount,
        args.reason
      );
      return result;
    },
  },
  {
    name: "gamification_invite",
    description: "Create an invite token for server connection.",
    scopes: ["write:gamification"],
    inputSchema: z.object({
      apiKeyId: z.string(),
      serverUrl: z.string().optional(),
      maxUses: z.number().positive().default(1),
    }),
    handler: async (
      args: { apiKeyId: string; serverUrl?: string; maxUses: number },
      extra?: McpToolExtraLike
    ) => {
      const { createInvite } = await import("../../../src/lib/gamification/invites");
      const result = await createInvite(
        resolveGamificationSubject(args.apiKeyId, extra),
        args.serverUrl,
        args.maxUses
      );
      return result;
    },
  },
  {
    name: "gamification_servers",
    description: "List connected community servers.",
    scopes: ["read:gamification"],
    inputSchema: z.object({}),
    handler: async () => {
      const { listServers } = await import("../../../src/lib/gamification/servers");
      return { servers: await listServers() };
    },
  },
  {
    name: "gamification_anomalies",
    description: "Get flagged anomalous XP activity (admin only).",
    scopes: ["read:gamification"],
    inputSchema: z.object({}),
    handler: async (_args: Record<string, never>, extra?: McpToolExtraLike) => {
      requireGamificationAnomalyAuthority(extra);
      const { getAnomalies } = await import("../../../src/lib/gamification/antiCheat");
      return { anomalies: await getAnomalies() };
    },
  },
];
