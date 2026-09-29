export type RefreshCircuitCarrier = {
  providerSpecificData?: {
    refreshCircuit?: {
      until?: unknown;
    } | null;
  } | null;
};

export function getRefreshBackoffUntilMs(
  conn: RefreshCircuitCarrier | null | undefined
): number | null {
  const until = conn?.providerSpecificData?.refreshCircuit?.until;
  if (typeof until !== "string") return null;
  const untilMs = new Date(until).getTime();
  return Number.isFinite(untilMs) ? untilMs : null;
}

export function isInRefreshBackoff(
  conn: RefreshCircuitCarrier | null | undefined,
  nowMs: number
): boolean {
  const untilMs = getRefreshBackoffUntilMs(conn);
  return untilMs !== null && untilMs > nowMs;
}
