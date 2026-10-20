import { install } from "@/lib/services/installers/openwa";
import { handleServiceInstall } from "@/app/api/services/_shared/installRoute";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export async function POST(request: Request): Promise<Response> {
  const authError = await requireManagementAuth(request, { alwaysRequireAuth: true });
  if (authError) return authError;

  return handleServiceInstall(request, install);
}
