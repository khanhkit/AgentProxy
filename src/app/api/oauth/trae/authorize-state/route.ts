import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { mintTraeCallbackState } from "@/lib/oauth/traeCallbackState";
import { AUTHZ_HEADER_PEER_LOCALITY } from "@/server/authz/headers";
import { validateBrowserMutationOrigin } from "@/server/origin/publicOrigin";

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get(AUTHZ_HEADER_PEER_LOCALITY) !== "loopback") {
    return NextResponse.json(
      { error: "Trae browser authorization requires local access" },
      { status: 403 }
    );
  }

  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  const originVerdict = validateBrowserMutationOrigin(request);
  if (!originVerdict.ok) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const issued = mintTraeCallbackState();
  return NextResponse.json({ state: issued.state, expiresAt: issued.expiresAt });
}
