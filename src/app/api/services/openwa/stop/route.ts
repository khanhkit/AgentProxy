import { getSupervisor } from "@/lib/services/registry";
import { createErrorResponse } from "@/lib/api/errorResponse";
import { sanitizeErrorMessage } from "@agentproxy/open-sse/utils/error";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

const TOOL = "openwa";

export async function POST(request: Request): Promise<Response> {
  const authError = await requireManagementAuth(request, { alwaysRequireAuth: true });
  if (authError) return authError;

  try {
    const sup = getSupervisor(TOOL);
    if (!sup) {
      return Response.json({ tool: TOOL, state: "stopped" });
    }
    const status = await sup.stop();
    return Response.json(status);
  } catch (err) {
    const msg = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
    return createErrorResponse({ status: 500, message: msg });
  }
}
