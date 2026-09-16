import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { processTraeAuthorizeCallback } from "./processCallback";

/**
 * GET /authorize
 *
 * Loopback callback for the Trae SOLO desktop OAuth flow (auth_from=solo).
 * Trae's authorize server validates that auth_callback_url ends with the
 * literal `/authorize` path — any other path makes the page short-circuit
 * to "Login Failed". So this handler lives at the app root, not under
 * /api/oauth/trae/. The provider tag is implicit (only Trae uses /authorize).
 *
 * Receives the redirect from https://www.trae.ai/authorization after the user
 * confirms login. Trae's auth server packs the entire credential set into
 * query parameters (no separate token-exchange HTTP call exists):
 *
 *   userJwt   — JSON string with { ClientID, Token, RefreshToken, TokenExpireAt,
 *               RefreshExpireAt, TokenExpireDuration }
 *   userInfo  — JSON string with { UserID, TenantID, Region, AIRegion, ... }
 *   refreshToken, loginTraceID, host, refreshExpireAt, userRegion, scope — flat fields
 *
 * We parse the bundle, persist a connection via `createProviderConnection`
 * (which encrypts the token), and return an HTML page that postMessages the
 * opening window before closing itself — that's how TraeAuthModal knows
 * the import succeeded.
 *
 * State/locality validation: the dashboard first obtains a short-lived,
 * server-issued one-time state and sends it as `login_trace_id`; Trae echoes it
 * back as `loginTraceID`. Before parsing or persisting credentials, the callback
 * processor verifies the authenticated TCP peer stamp is direct loopback and
 * atomically consumes that state. The modal additionally matches the echoed
 * value on postMessage as a presentation-layer defense in depth.
 */
function htmlClose(message: Record<string, unknown>, t: (key: string) => string): NextResponse {
  // Embedding values: only emit the small/sanitized status payload — never the
  // raw token. We post to the loopback origin pair (localhost + 127.0.0.1) on
  // this same port rather than "*": Trae forces the callback onto 127.0.0.1,
  // but the dashboard opener is usually on localhost, so a single
  // window.location.origin target would silently drop the message. Restricting
  // to the two known loopback hosts keeps it secure (CWE-359) and working.
  const safe = JSON.stringify({
    type: "trae-oauth-callback",
    ...message,
  }).replace(/</g, "\\u003c");
  const title = message.success ? t("traeAuthorizationSuccess") : t("traeAuthorizationFailed");
  const body = message.success ? t("closeAuthorizationWindow") : t("returnToDashboard");
  return new NextResponse(
    `<!doctype html><html><body style="font:16px sans-serif;padding:40px">
      <h2 style="margin:0 0 8px">${title}</h2>
      <p>${body}</p>
      <script>
        (function () {
          try {
            if (!window.opener) return;
            var msg = ${safe};
            var loc = window.location;
            var targets = [loc.origin];
            var alt = loc.hostname === "127.0.0.1" ? "localhost" : loc.hostname === "localhost" ? "127.0.0.1" : null;
            if (alt) targets.push(loc.protocol + "//" + alt + (loc.port ? ":" + loc.port : ""));
            targets.forEach(function (t) { try { window.opener.postMessage(msg, t); } catch (e) {} });
          } catch (e) {}
        })();
        setTimeout(function () { window.close(); }, ${message.success ? 800 : 4000});
      </script>
    </body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function rejectUntrustedCallback(message: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><body style="font:16px sans-serif;padding:40px"><h2>Trae authorization failed</h2><p>${message}</p></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: Request) {
  const result = await processTraeAuthorizeCallback(request);
  if (!result.ok && result.kind === "security") {
    return rejectUntrustedCallback(result.error);
  }

  const t = await getTranslations("auth");
  if (!result.ok) {
    return htmlClose({ success: false, error: result.error }, t);
  }

  return htmlClose(
    {
      success: true,
      connectionId: result.connectionId,
      loginTraceId: result.loginTraceId,
    },
    t
  );
}
