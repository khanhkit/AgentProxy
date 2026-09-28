/**
 * links.ts — pure config for the two Radar "get a supporter key" outbound
 * links (F4/T7): the contributor-claim (GitHub OAuth) flow and the
 * supporter-plans entry point. Private hosted services are opt-in via env;
 * the safe default is the AgentProxy repository.
 *
 * DELIBERATELY DB-FREE and side-effect-free — same shape as the
 * `RADAR_FEED_URL` override already used by `./sync.ts`, so forks/self-hosters
 * point both links at their own deployment via env vars (see
 * docs/frameworks/RADAR.md).
 *
 * These functions are read server-side only (inside a route handler) and the
 * resolved URLs are relayed to the client via GET /api/radar/settings — the
 * dashboard page never reads `process.env` itself, matching the pattern the
 * D28 referral links already established for the private feed.
 *
 * No price or monetary value is ever resolved, stored, or exposed here — the
 * URLs point at pages that are themselves the ONLY place pricing lives
 * (spec D14: no pricing in the OSS repo).
 */

import { parseRadarAdminUrl } from "@/shared/validation/radarAdminUrl";

/** Safe fallback when no private contributor-claim service is configured. */
const DEFAULT_CONTRIBUTOR_CLAIM_URL = "https://github.com/khanhkit/AgentProxy";

/** Safe fallback when no private supporter-plans service is configured. */
const DEFAULT_SUPPORTER_PLANS_URL = "https://github.com/khanhkit/AgentProxy";

/**
 * URL that starts the "I'm a contributor" GitHub OAuth claim flow.
 * Override with `RADAR_CONTRIBUTOR_CLAIM_URL` for forks/self-hosters.
 */
export function getContributorClaimUrl(): string {
  return process.env.RADAR_CONTRIBUTOR_CLAIM_URL || DEFAULT_CONTRIBUTOR_CLAIM_URL;
}

/**
 * URL for the "Support the project" plans/payment page.
 * Override with `RADAR_SUPPORTER_PLANS_URL` for forks/self-hosters.
 */
export function getSupporterPlansUrl(): string {
  return process.env.RADAR_SUPPORTER_PLANS_URL || DEFAULT_SUPPORTER_PLANS_URL;
}

/**
 * Private operations-panel URL configured by the instance owner.
 * Unlike the public supporter flows, this deliberately has no default.
 */
export function getRadarAdminUrl(): string | null {
  return parseRadarAdminUrl(process.env.RADAR_ADMIN_URL);
}
