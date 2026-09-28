import { NextResponse } from "next/server";
import { getApiKeyMetadata, validateApiKey } from "@/lib/db/apiKeys";
import { extractApiKey } from "@/sse/services/auth";
import { isDashboardSessionAuthenticated } from "@/shared/utils/apiAuth";
import { enforceApiKeyPolicy } from "@/shared/utils/apiKeyPolicy";
import { CORS_HEADERS } from "@/shared/utils/cors";
import { buildErrorBody } from "@agentproxy/open-sse/utils/error";
import { ANONYMOUS_OWNER_ID } from "@/shared/constants/anonymousOwner";
import { hasManageScope } from "@/shared/constants/managementScopes";

export type ApiKeyState = "none" | "unresolved" | "invalid" | "valid";

export interface ApiKeyRequestScope {
  apiKey: string | null;
  apiKeyId: string | null;
  apiKeyMetadata: Awaited<ReturnType<typeof getApiKeyMetadata>>;
  keyState: ApiKeyState;
  rejection: Response | null;
  isSessionAuth: boolean;
}

export async function getApiKeyRequestScope(request: Request): Promise<ApiKeyRequestScope> {
  const isSessionAuth = await isDashboardSessionAuthenticated(request);
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    return {
      apiKey: null,
      apiKeyId: null,
      apiKeyMetadata: null,
      keyState: "none",
      rejection: null,
      isSessionAuth,
    };
  }

  const apiKeyMetadata = await getApiKeyMetadata(apiKey);
  let keyState: ApiKeyState = "unresolved";
  if (apiKeyMetadata) keyState = (await validateApiKey(apiKey)) ? "valid" : "invalid";

  if (keyState !== "valid") {
    return {
      apiKey,
      apiKeyId: null,
      apiKeyMetadata: null,
      keyState,
      rejection: null,
      isSessionAuth,
    };
  }

  return {
    apiKey,
    apiKeyId: apiKeyMetadata.id,
    apiKeyMetadata,
    keyState,
    rejection: null,
    isSessionAuth,
  };
}

function unauthorized(message: string): Response {
  return NextResponse.json(buildErrorBody(401, message), { status: 401, headers: CORS_HEADERS });
}

export async function getPolicyAwareApiKeyRequestScope(
  request: Request
): Promise<ApiKeyRequestScope> {
  const scope = await getApiKeyRequestScope(request);
  if (scope.rejection) return scope;

  if (scope.apiKey && !scope.apiKeyId) {
    return { ...scope, rejection: unauthorized("Invalid API key") };
  }

  const policy = await enforceApiKeyPolicy(request, null);
  if (policy.rejection) return { ...scope, rejection: policy.rejection };

  return {
    ...scope,
    apiKeyId: scope.apiKeyId ?? policy.apiKeyInfo?.id ?? null,
  };
}

type OwnershipScope = Pick<ApiKeyRequestScope, "isSessionAuth" | "apiKeyId"> &
  Partial<Pick<ApiKeyRequestScope, "apiKeyMetadata">>;

export function canAccessOwnedRecord(
  scope: OwnershipScope,
  recordApiKeyId: string | null | undefined
): boolean {
  if (hasManageScope(scope.apiKeyMetadata?.scopes ?? [])) return true;
  if (scope.apiKeyId) return recordApiKeyId === scope.apiKeyId;
  if (scope.isSessionAuth) return true;
  return recordApiKeyId === ANONYMOUS_OWNER_ID;
}

export function resolveEffectiveApiKeyId(
  scope: Pick<ApiKeyRequestScope, "apiKeyId" | "isSessionAuth">,
  policyApiKeyInfo: { id: string } | null
): string | null {
  if (scope.apiKeyId) return scope.apiKeyId;
  if (policyApiKeyInfo?.id) return policyApiKeyInfo.id;
  if (scope.isSessionAuth) return null;
  return ANONYMOUS_OWNER_ID;
}

export type OwnedListScope =
  | { mode: "api_key"; apiKeyId: string }
  | { mode: "instance" }
  | { mode: "rejected"; response: Response };

export function resolveListScope(scope: ApiKeyRequestScope): OwnedListScope {
  if (scope.apiKey && !scope.apiKeyId) {
    return { mode: "rejected", response: unauthorized("Invalid API key") };
  }
  if (scope.apiKeyId && hasManageScope(scope.apiKeyMetadata?.scopes ?? [])) {
    return { mode: "instance" };
  }
  if (scope.apiKeyId) {
    return { mode: "api_key", apiKeyId: scope.apiKeyId };
  }
  if (scope.isSessionAuth) {
    return { mode: "instance" };
  }
  return { mode: "rejected", response: unauthorized("Authentication required") };
}
