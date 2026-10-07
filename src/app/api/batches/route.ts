import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { listBatches } from "@/lib/db/batches";
import {
  getPolicyAwareApiKeyRequestScope,
  resolveListScope,
} from "@/app/api/v1/_helpers/apiKeyScope";

export async function GET(request: Request) {
  const scope = await getPolicyAwareApiKeyRequestScope(request);
  if (scope.rejection) return scope.rejection;
  const listScope = resolveListScope(scope);
  if (listScope.mode === "rejected") return listScope.response;

  try {
    const url = new URL(request.url);
    const limit = Number.parseInt(url.searchParams.get("limit") || "100", 10);
    const ownerFilter = listScope.mode === "api_key" ? listScope.apiKeyId : undefined;
    const batches = listBatches(ownerFilter, limit);
    return NextResponse.json({ batches });
  } catch (error) {
    console.log("Error fetching batches:", error);
    return NextResponse.json({ error: "Failed to fetch batches" }, { status: 500 });
  }
}
