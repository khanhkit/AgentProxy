import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getBatch } from "@/lib/db/batches";
import {
  canAccessOwnedRecord,
  getPolicyAwareApiKeyRequestScope,
} from "@/app/api/v1/_helpers/apiKeyScope";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const scope = await getPolicyAwareApiKeyRequestScope(request);
  if (scope.rejection) return scope.rejection;

  try {
    const batch = getBatch(params.id);
    if (!batch || !canAccessOwnedRecord(scope, batch.apiKeyId)) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }
    return NextResponse.json({ batch });
  } catch (error) {
    console.log("Error fetching batch:", error);
    return NextResponse.json({ error: "Failed to fetch batch" }, { status: 500 });
  }
}
