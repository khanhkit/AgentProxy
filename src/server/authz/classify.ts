import {
  isPublicApiRoute,
  isPublicReadonlyCorsRoute,
} from "../../shared/constants/publicApiRoutes";
import { normalizeClientApiPathname } from "../../shared/utils/clientApiPath";
import type { RouteClassification } from "./types";

const MANAGEMENT_REWRITE_ALIAS_PREFIXES: ReadonlyArray<{ alias: string; canonical: string }> = [
  { alias: "/anthropic", canonical: "/api/anthropic" },
  { alias: "/openai", canonical: "/api/openai" },
];

const MANAGEMENT_REWRITE_ALIAS_EXACT = new Map([
  ["/metrics", "/api/metrics"],
  ["/debug", "/api/debug"],
]);

function normalizeManagementRewriteAlias(rawPath: string): string {
  let path = rawPath || "/";
  if (!path.startsWith("/")) path = "/" + path;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  const lower = path.toLowerCase();
  const exact = MANAGEMENT_REWRITE_ALIAS_EXACT.get(lower);
  if (exact) return exact;

  for (const { alias, canonical } of MANAGEMENT_REWRITE_ALIAS_PREFIXES) {
    if (lower === alias) return canonical;
    if (lower.startsWith(alias + "/")) {
      return canonical + path.slice(alias.length);
    }
  }

  return path;
}

export function classifyRoute(rawPath: string, method: string = "GET"): RouteClassification {
  const rewriteNormalizedPath = normalizeManagementRewriteAlias(rawPath);
  const { path: normalizedPath, reason: aliasReason } =
    normalizeClientApiPathname(rewriteNormalizedPath);

  if (normalizedPath === "/" || normalizedPath === "") {
    return {
      routeClass: "MANAGEMENT",
      reason: "root_redirect",
      normalizedPath: "/",
    };
  }

  if (normalizedPath === "/dashboard/onboarding") {
    return {
      routeClass: "PUBLIC",
      reason: "setup_wizard",
      normalizedPath,
    };
  }

  // Public, ticket-gated device-flow connect pages (e.g. /connect/codex/{token}).
  // Anyone with the shared link completes the provider login in their own browser.
  if (normalizedPath === "/connect" || normalizedPath.startsWith("/connect/")) {
    return {
      routeClass: "PUBLIC",
      reason: "public_connect_page",
      normalizedPath,
    };
  }

  if (normalizedPath.startsWith("/dashboard")) {
    return {
      routeClass: "MANAGEMENT",
      reason: "dashboard_prefix",
      normalizedPath,
    };
  }

  if (normalizedPath === "/api/v1" || normalizedPath.startsWith("/api/v1/")) {
    return {
      routeClass: "CLIENT_API",
      reason: aliasReason ?? "client_api_v1",
      normalizedPath,
    };
  }

  if (normalizedPath === "/api/v1beta" || normalizedPath.startsWith("/api/v1beta/")) {
    return {
      routeClass: "CLIENT_API",
      reason: aliasReason ?? "client_api_v1",
      normalizedPath,
    };
  }

  if (normalizedPath.startsWith("/api/")) {
    if (isClassifiedAsPublic(normalizedPath, method)) {
      return {
        routeClass: "PUBLIC",
        reason: matchesReadonlyPublic(normalizedPath, method)
          ? "public_readonly_prefix"
          : "public_prefix",
        normalizedPath,
      };
    }

    return {
      routeClass: "MANAGEMENT",
      reason: "management_api",
      normalizedPath,
    };
  }

  return {
    routeClass: "MANAGEMENT",
    reason: "fallback_management",
    normalizedPath,
  };
}

function matchesReadonlyPublic(path: string, method: string): boolean {
  // Exact match, not startsWith: a prefix here would hand the CORS origin
  // relaxation to every adjacent path too (GHSA-74g9-q8f6-793h).
  return isPublicReadonlyCorsRoute(path, method);
}

function isClassifiedAsPublic(path: string, method: string): boolean {
  return isPublicApiRoute(path, method);
}
