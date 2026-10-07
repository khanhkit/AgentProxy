export function resolveOperatorUsageFields(
  authed: boolean,
  steadyRecurringTokens: number,
  loadUsage: () => number
): { usedThisMonth: number | null; remaining: number | null } {
  if (!authed) return { usedThisMonth: null, remaining: null };
  const usedThisMonth = loadUsage();
  return {
    usedThisMonth,
    remaining: Math.max(0, steadyRecurringTokens - usedThisMonth),
  };
}
