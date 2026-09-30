import { NextResponse } from "next/server";
import { getFile, getFileContent } from "@/lib/db/files";
import {
  canAccessOwnedRecord,
  getPolicyAwareApiKeyRequestScope,
} from "@/app/api/v1/_helpers/apiKeyScope";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await getPolicyAwareApiKeyRequestScope(request);
  if (scope.rejection) return scope.rejection;

  const { id } = await params;
  const file = getFile(id);

  if (!file || !canAccessOwnedRecord(scope, file.apiKeyId)) {
    return NextResponse.json(
      { error: { message: "File not found", type: "invalid_request_error" } },
      { status: 404 }
    );
  }

  const content = getFileContent(id);
  if (!content) {
    return NextResponse.json(
      { error: { message: "File content not found", type: "invalid_request_error" } },
      { status: 404 }
    );
  }

  const filename = file.filename || id;
  return new Response(content as unknown as BodyInit, {
    headers: {
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
