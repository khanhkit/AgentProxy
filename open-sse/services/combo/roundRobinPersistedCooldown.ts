import { getCachedProviderConnectionById } from "../../../src/lib/db/readCache.ts";
import { resolvePersistedConnectionCooldownSkipReason } from "./comboPredicates.ts";

export async function resolveRoundRobinPersistedCooldown(
  target: { connectionId?: string | null; modelStr: string },
  allowRateLimitedConnection: boolean
): Promise<string | null> {
  if (!allowRateLimitedConnection || !target.connectionId) return null;
  return resolvePersistedConnectionCooldownSkipReason(target as never, getCachedProviderConnectionById, true);
}
