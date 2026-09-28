/**
 * opencodeGeoBlock.ts — geo-block predicate for the opencode executor loop.
 *
 * Leaf module: zero internal imports (layering — errorClassifier pulls
 * accountFallback + registry + DB; this file must not). The 1010 check below
 * mirrors errorClassifier.isCloudflareFingerprintRejection semantics for the
 * tokens this path needs; any divergence is a bug — see the parity test.
 */

// "not available in your country" is the observed opencode RegionError phrasing
// (2026-09-07 — app.log: "This model is not available in your country.");
// siblings cover the same class, not the single incident. No bare "in your
// country/region": location text without the full prefix is not a geo signal.
// OpenCode free-tier request refusal: exact observed token/sentence only.
const FREE_TIER_SIGNALS = ["freetiererror", "free tier can only be used"];
const USER_BLOCKED_SIGNAL = "user_blocked";

const GEO_SIGNALS = [
  "not available in your country",
  "not available in your region",
  "unsupported_country",
  "unsupported country",
];

// `regionerror` word-bounded: bare substring would match region_error /
// region-error variants, which are unobserved phrasings (fail closed).
const REGION_ERROR_REGEX = /(?<![A-Za-z0-9_-])regionerror(?![A-Za-z0-9_-])/i;

// Fingerprint-first: a CDN 1010 rejection says nothing about account health —
// it must never rotate as geo. Parity with errorClassifier
// isCloudflareFingerprintRejection: the bare number 1010 alone is NOT a signal
// (it occurs as port/count/model token) — only with an explicit Cloudflare key
// or the unique tokens (mirrored vectors live in the parity test below).
const CLOUDFLARE_1010_KEY_REGEX =
  /(?<![A-Za-z0-9_-])error[\s_-]?code[\\"':=\s]{0,12}1010(?!\w)|(?<![A-Za-z0-9_-])error[-_]\s?1010(?!\w)\/?/i;

function isFingerprintRejection(bodyText: string): boolean {
  const text = String(bodyText || "");
  const lower = text.toLowerCase();
  return (
    CLOUDFLARE_1010_KEY_REGEX.test(text) ||
    lower.includes("browser_signature_banned") ||
    lower.includes("fingerprint_rejection")
  );
}

export function isOpencodeGeoBlocked(status: number, bodyText: string): boolean {
  if (status !== 403 && status !== 451) return false;
  const text = String(bodyText || "");
  if (isFingerprintRejection(text)) return false;
  const lower = text.toLowerCase();
  if (REGION_ERROR_REGEX.test(text)) return true;
  return GEO_SIGNALS.some((signal) => lower.includes(signal));
}

/**
 * 403/451 refusal scoped to the request shape/client identity, not account health.
 * More specific fingerprint/geo/user-blocked signals retain their own handling.
 */
export function isOpencodeFreeTierRefusal(status: number, bodyText: string | null): boolean {
  if (status !== 403 && status !== 451) return false;
  const text = String(bodyText || "");
  if (isFingerprintRejection(text) || isOpencodeGeoBlocked(status, text)) return false;
  const lower = text.toLowerCase();
  if (lower.includes(USER_BLOCKED_SIGNAL)) return false;
  return FREE_TIER_SIGNALS.some((signal) => lower.includes(signal));
}

export function isOpencodeFreeTierRefusalForProvider(
  provider: string | null | undefined,
  status: number,
  bodyText: string | null
): boolean {
  if (!provider || !provider.toLowerCase().startsWith("opencode")) return false;
  return isOpencodeFreeTierRefusal(status, bodyText);
}

export function proxyKeyOf(proxy: { host: string; port: number } | null): string | null {
  if (!proxy) return null;
  return `${proxy.host}:${proxy.port}`;
}
