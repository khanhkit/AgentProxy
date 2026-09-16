import { NextResponse } from "next/server";
import { recoverApiKeyById } from "@/lib/db/apiKeys";
import { isApiKeyRevealEnabled } from "@/lib/apiKeyExposure";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import * as log from "@/sse/utils/logger";

// GET /api/keys/[id]/reveal - Reveal full API key for explicit copy actions
export async function GET(request, { params }) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    if (!isApiKeyRevealEnabled()) {
      return NextResponse.json({ error: "API key reveal is disabled" }, { status: 403 });
    }

    const { id } = await params;
    const key = await recoverApiKeyById(id);

    if (!key) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    return NextResponse.json({ key });
  } catch (error) {
    log.error("keys", "Error revealing key", error);
    return NextResponse.json({ error: "Failed to reveal key" }, { status: 500 });
  }
}
