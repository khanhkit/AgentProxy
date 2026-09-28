import { createProviderConnection } from "@/models";
import { consumeTraeCallbackState, isTrustedTraeCallbackPeer } from "@/lib/oauth/traeCallbackState";
import { parseTraeCallbackQuery } from "./parseCallback";

export type TraeAuthorizeCallbackResult =
  | {
      ok: true;
      connectionId: string;
      loginTraceId: string | null;
    }
  | {
      ok: false;
      kind: "security" | "invalid" | "internal";
      error: string;
    };

export async function processTraeAuthorizeCallback(
  request: Request
): Promise<TraeAuthorizeCallbackResult> {
  if (!isTrustedTraeCallbackPeer(request)) {
    return {
      ok: false,
      kind: "security",
      error: "This callback is only accepted from the local AgentProxy process.",
    };
  }

  const url = new URL(request.url);
  const q = url.searchParams;
  const loginTraceId = q.get("loginTraceID");
  if (!consumeTraeCallbackState(loginTraceId)) {
    return {
      ok: false,
      kind: "security",
      error: "The authorization state is missing, expired, or already used.",
    };
  }

  const parsed = parseTraeCallbackQuery(q);
  if (!parsed.ok) {
    return { ok: false, kind: "invalid", error: parsed.error };
  }

  try {
    const connection = (await createProviderConnection(parsed.record)) as { id: string };
    return { ok: true, connectionId: connection.id, loginTraceId };
  } catch (error) {
    console.error("[trae callback] error:", error);
    return { ok: false, kind: "internal", error: "Internal error during callback" };
  }
}
