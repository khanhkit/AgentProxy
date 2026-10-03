import { NextResponse } from "next/server";
import { getAuditRequestContext, logAuditEvent } from "@/lib/compliance/index";
import { cookies } from "next/headers";
import { getSettings, updateSettings } from "@/lib/db/settings";
import {
  DASHBOARD_SESSION_COOKIE,
  REVOKED_SESSIONS_SETTING,
  addRevokedSession,
  verifyDashboardSessionToken,
} from "@/shared/utils/dashboardSessionToken";

export const logoutRouteInternals = {
  getCookieStore: cookies,
};

export async function POST(request) {
  const auditContext = getAuditRequestContext(request);
  const cookieStore = await logoutRouteInternals.getCookieStore();
  try {
    const payload = await verifyDashboardSessionToken(
      cookieStore.get(DASHBOARD_SESSION_COOKIE)?.value
    );
    if (payload && typeof payload.jti === "string" && typeof payload.exp === "number") {
      const settings = (await getSettings()) as Record<string, unknown>;
      await updateSettings({
        [REVOKED_SESSIONS_SETTING]: addRevokedSession(
          settings[REVOKED_SESSIONS_SETTING],
          { jti: payload.jti, exp: payload.exp },
          Math.floor(Date.now() / 1000)
        ),
      });
    }
  } catch (error) {
    console.error("[auth] Failed to revoke the signed-out session:", error);
  }
  cookieStore.delete(DASHBOARD_SESSION_COOKIE);
  logAuditEvent({
    action: "auth.logout.success",
    actor: "admin",
    target: "dashboard-auth",
    resourceType: "auth_session",
    status: "success",
    ipAddress: auditContext.ipAddress || undefined,
    requestId: auditContext.requestId,
  });
  return NextResponse.json({ success: true });
}
