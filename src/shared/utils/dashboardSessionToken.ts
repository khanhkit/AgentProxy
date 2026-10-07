import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const DASHBOARD_SESSION_COOKIE = "auth_token";
export const DASHBOARD_SESSION_CLAIM = "authenticated";
export const SESSIONS_VALID_AFTER_SETTING = "sessionsValidAfter";
export const REVOKED_SESSIONS_SETTING = "revokedDashboardSessions";
const MAX_REVOKED_SESSIONS = 500;

export type RevokedSession = { jti: string; exp: number };

export function getDashboardJwtSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET?.trim();
  return secret ? new TextEncoder().encode(secret) : null;
}

export async function mintDashboardSessionToken(secret: Uint8Array): Promise<string> {
  return new SignJWT({ [DASHBOARD_SESSION_CLAIM]: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime("30d")
    .sign(secret);
}

export function addRevokedSession(
  current: unknown,
  session: RevokedSession,
  nowSeconds: number
): RevokedSession[] {
  const kept = (Array.isArray(current) ? (current as RevokedSession[]) : []).filter(
    (entry) =>
      entry &&
      typeof entry.jti === "string" &&
      typeof entry.exp === "number" &&
      entry.exp > nowSeconds &&
      entry.jti !== session.jti
  );
  return [...kept, session].slice(-MAX_REVOKED_SESSIONS);
}

async function isDashboardSessionEnded(payload: JWTPayload): Promise<boolean> {
  try {
    const { getCachedSettings } = await import("@/lib/db/readCache");
    const settings = (await getCachedSettings()) as Record<string, unknown>;
    const validAfter = settings[SESSIONS_VALID_AFTER_SETTING];
    if (typeof validAfter === "number" && (payload.iat ?? 0) < validAfter) return true;

    const revoked = settings[REVOKED_SESSIONS_SETTING];
    if (
      typeof payload.jti === "string" &&
      Array.isArray(revoked) &&
      revoked.some((entry) => entry && (entry as RevokedSession).jti === payload.jti)
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

export async function verifyDashboardSessionToken(
  token: string | null | undefined,
  secret: Uint8Array | null = getDashboardJwtSecret()
): Promise<JWTPayload | null> {
  if (!token || !secret || secret.length === 0) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (payload[DASHBOARD_SESSION_CLAIM] !== true) return null;
    return (await isDashboardSessionEnded(payload)) ? null : payload;
  } catch {
    return null;
  }
}
