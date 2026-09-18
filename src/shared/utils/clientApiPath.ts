export type ClientApiPathNormalizationReason =
  "client_api_alias" | "client_api_codex_alias" | "client_api_double_prefix";

const CLIENT_API_ALIAS_PREFIXES: ReadonlyArray<{ alias: string; canonical: string }> = [
  { alias: "/chat/completions", canonical: "/api/v1/chat/completions" },
  { alias: "/responses", canonical: "/api/v1/responses" },
  { alias: "/models", canonical: "/api/v1/models" },
];

/**
 * Canonicalize public client-API aliases to the internal route shape used by
 * authz policy. Only the leading control segment is matched case-insensitively;
 * the original tail casing is preserved.
 */
export function normalizeClientApiPathname(rawPath: string): {
  path: string;
  reason?: ClientApiPathNormalizationReason;
} {
  let path = rawPath || "/";
  if (!path.startsWith("/")) path = "/" + path;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  const lower = path.toLowerCase();

  if (lower === "/codex" || lower.startsWith("/codex/")) {
    return { path: "/api/v1/responses", reason: "client_api_codex_alias" };
  }

  if (lower === "/v1/v1" || lower.startsWith("/v1/v1/")) {
    const tail = path.slice("/v1/v1".length) || "";
    return { path: "/api/v1" + tail, reason: "client_api_double_prefix" };
  }

  if (lower === "/v1beta" || lower.startsWith("/v1beta/")) {
    const tail = path.slice("/v1beta".length) || "";
    return { path: "/api/v1beta" + tail, reason: "client_api_alias" };
  }

  if (lower === "/v1" || lower.startsWith("/v1/")) {
    const tail = path.slice("/v1".length) || "";
    return { path: "/api/v1" + tail, reason: "client_api_alias" };
  }

  for (const { alias, canonical } of CLIENT_API_ALIAS_PREFIXES) {
    if (lower === alias) {
      return { path: canonical, reason: "client_api_alias" };
    }
    if (lower.startsWith(alias + "/")) {
      return { path: canonical + path.slice(alias.length), reason: "client_api_alias" };
    }
  }

  return { path };
}
