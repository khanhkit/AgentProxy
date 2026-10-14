import { getServiceRow } from "@/lib/db/versionManager";
import { getOrInitSupervisor } from "../_lib";
import { createErrorResponse } from "@/lib/api/errorResponse";
import { sanitizeErrorMessage } from "@agentproxy/open-sse/utils/error";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

const TOOL = "openwa";

export async function POST(request: Request): Promise<Response> {
  const authError = await requireManagementAuth(request, { alwaysRequireAuth: true });
  if (authError) return authError;

  try {
    const row = await getServiceRow(TOOL);
    if (!row || row.status === "not_installed") {
      return createErrorResponse({ status: 409, message: "open-wa não está instalado." });
    }

    const sup = await getOrInitSupervisor();
    const status = await sup.start();
    return Response.json(status);
  } catch (err) {
    const msg = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
    return createErrorResponse({ status: 503, message: msg });
  }
}
