import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  EGRESS_IP_LOOKUP_WINDOW_MS,
  getPoolEgressFailureBreakdown,
} from "@/lib/db/proxyLogs";
import { createErrorResponse, createErrorResponseFromUnknown } from "@/lib/api/errorResponse";
import {
  diagnoseAllEgressIps,
  getRecentEgressSharingSummary,
  validateProxyPool,
} from "@/lib/proxyEgress";

/**
 * GET  /api/settings/proxies/egress — diagnose the egress IP of every OAuth
 *   connection: by which IP each account is entering (clientIp) and leaving
 *   (egressIp), plus warnings for same-rotation-group accounts sharing one
 *   egress IP (the codex anomaly-revocation trigger).
 *
 * POST /api/settings/proxies/egress — validate the whole proxy pool by probing
 *   each proxy's real egress IP and persisting status=active/error, so dead
 *   proxies are taken out of rotation automatically.
 */
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const rawScope = searchParams.get("scope");
    const scope = rawScope === "key" ? "account" : rawScope;
    const scopeId = scope === "global" ? null : searchParams.get("scopeId")?.trim() || null;
    const validPoolScopes = new Set(["global", "provider", "account", "combo"]);
    if (scope && !validPoolScopes.has(scope)) {
      return createErrorResponse({ status: 400, message: "Invalid pool scope", type: "invalid_request" });
    }
    if (scope && scope !== "global" && !scopeId) {
      return createErrorResponse({
        status: 400,
        message: "scopeId is required for scoped pool diagnostics",
        type: "invalid_request",
      });
    }

    const [diagnostic, { summary }] = await Promise.all([
      diagnoseAllEgressIps(),
      getRecentEgressSharingSummary(),
    ]);
    const poolFailures = scope
      ? getPoolEgressFailureBreakdown(
          scope,
          scopeId,
          new Date(Date.now() - EGRESS_IP_LOOKUP_WINDOW_MS).toISOString()
        )
      : undefined;
    return NextResponse.json({
      ...diagnostic,
      summary,
      ...(poolFailures ? { poolFailures } : {}),
    });
  } catch (error) {
    return createErrorResponseFromUnknown(error, "Failed to diagnose egress IPs");
  }
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;
  try {
    const report = await validateProxyPool();
    const dead = report.filter((r) => !r.alive);
    return NextResponse.json({
      validated: report.length,
      alive: report.length - dead.length,
      dead: dead.length,
      report,
    });
  } catch (error) {
    return createErrorResponseFromUnknown(error, "Failed to validate proxy pool");
  }
}
