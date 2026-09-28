/** Resolve the configured Radar service base URL without inventing a hosted default. */
export function resolveRadarFeedBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.RADAR_FEED_URL?.trim();
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

export const RADAR_FEED_URL_MISSING_REASON =
  "RADAR_FEED_URL is not configured; Radar sync is disabled until an explicit service URL is provided";
