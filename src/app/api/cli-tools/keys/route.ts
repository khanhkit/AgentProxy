import { NextResponse } from "next/server";
import { requireCliToolsAuth } from "@/lib/api/requireCliToolsAuth";
import { getApiKeys } from "@/lib/db/apiKeys";
import { maskStoredApiKey } from "@/lib/apiKeyExposure";

// GET /api/cli-tools/keys - List API-key metadata; raw bearers are recovered only by selected-key flows.
export async function GET(request: Request) {
  const authError = await requireCliToolsAuth(request);
  if (authError) return authError;

  try {
    const keys = await getApiKeys();
    const cliToolKeys = keys.map((key) => ({
      ...key,
      rawKey: null,
      key: maskStoredApiKey(key.key),
    }));
    return NextResponse.json({ keys: cliToolKeys, total: cliToolKeys.length });
  } catch (error) {
    console.log("Error fetching CLI tool keys:", error);
    return NextResponse.json({ error: "Failed to fetch CLI tool keys" }, { status: 500 });
  }
}
