export const MAX_SUBSCRIPTION_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_SUBSCRIPTION_NODES = 5_000;
export const MIN_SUBSCRIPTION_UPDATE_INTERVAL_MINUTES = 1;
export const MAX_SUBSCRIPTION_UPDATE_INTERVAL_MINUTES = 365 * 24 * 60;
export const DEFAULT_SUBSCRIPTION_UPDATE_INTERVAL_MINUTES = 60;

export const SUBSCRIPTION_UPDATE_INTERVAL_ERROR =
  "updateIntervalMinutes must be between 1 and 525600";

export function isValidSubscriptionUpdateInterval(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MIN_SUBSCRIPTION_UPDATE_INTERVAL_MINUTES &&
    value <= MAX_SUBSCRIPTION_UPDATE_INTERVAL_MINUTES
  );
}

/**
 * Legacy database rows may predate interval validation. Keep them bounded
 * without making an invalid row permanently hot or permanently stuck.
 */
export function normalizeLegacySubscriptionIntervalMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SUBSCRIPTION_UPDATE_INTERVAL_MINUTES;
  return Math.min(
    MAX_SUBSCRIPTION_UPDATE_INTERVAL_MINUTES,
    Math.max(MIN_SUBSCRIPTION_UPDATE_INTERVAL_MINUTES, value)
  );
}
