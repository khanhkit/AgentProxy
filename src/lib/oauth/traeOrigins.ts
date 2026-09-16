export const TRAE_OAUTH_ORIGIN = "https://api-us-east.trae.ai";

/**
 * Normalize the persisted/callback Trae API host to the single approved OAuth
 * origin. Empty values use the documented default; arbitrary origins, paths,
 * credentials, query strings, and fragments are rejected before transport.
 */
export function canonicalizeTraeOAuthOrigin(input: unknown): string {
  const raw = typeof input === "string" && input.trim() ? input.trim() : TRAE_OAUTH_ORIGIN;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Trae OAuth host must be an approved origin");
  }

  const canonicalPath = parsed.pathname === "" || parsed.pathname === "/";
  const hasAuthorityExtras = Boolean(parsed.username || parsed.password);
  const hasUrlExtras = Boolean(parsed.search || parsed.hash);

  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== TRAE_OAUTH_ORIGIN ||
    !canonicalPath ||
    hasAuthorityExtras ||
    hasUrlExtras
  ) {
    throw new Error("Trae OAuth host must be an approved origin");
  }

  return TRAE_OAUTH_ORIGIN;
}
