import { CORS_HEADERS, handleCorsOptions } from "@/shared/utils/cors";
import { deleteCompletedBatches } from "@/lib/db/batches";
import { NextResponse } from "next/server";
import { getPolicyAwareApiKeyRequestScope } from "@/app/api/v1/_helpers/apiKeyScope";
import { buildErrorBody } from "@agentproxy/open-sse/utils/error";

export async function OPTIONS() {
  return handleCorsOptions();
}

export async function DELETE(request: Request) {
  const scope = await getPolicyAwareApiKeyRequestScope(request);
  if (scope.rejection) return scope.rejection;

  // Allow session-authenticated (dashboard) requests; for API-key requests, require a key
  if (!scope.isSessionAuth && !scope.apiKeyId) {
    return NextResponse.json(buildErrorBody(401, "Authentication required"), {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  // Scope the sweep to the caller. Only the operator's own dashboard (session
  // auth) may clear the whole instance; an API key clears only its own
  // completed batches (GHSA-wvxc-jp3v-5mg5).
  try {
    const result = deleteCompletedBatches(scope.apiKeyId ?? undefined);
    return NextResponse.json(
      {
        deleted: true,
        deletedBatches: result.deletedBatches,
        deletedFiles: result.deletedFiles,
        hasMore: result.hasMore,
        pageSize: result.pageSize,
      },
      { headers: CORS_HEADERS }
    );
  } catch {
    return NextResponse.json(buildErrorBody(500, "Failed to delete completed batches"), {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
}
