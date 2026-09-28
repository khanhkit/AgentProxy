import { getGitHubCopilotChatUserAgent } from "@agentproxy/open-sse/config/providerHeaderProfiles.ts";
import { GHE_COPILOT_CONFIG } from "../constants/oauth";
import { sanitizeErrorMessage } from "@agentproxy/open-sse/utils/error";
import { stripTrailingSlashes } from "@agentproxy/open-sse/utils/urlSanitize.ts";
import { safeOutboundFetch } from "@/shared/network/safeOutboundFetch";

/**
 * GHE Copilot OAuth provider.
 *
 * Reuses the GitHub device-code flow but targets the GitHub Enterprise host
 * configured per-connection via `gheUrl` (stored in providerSpecificData).
 * The device-code / token / user-info / copilot-token endpoints are derived
 * from gheUrl at request time.
 */

function normalizeGheUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("gheUrl is required for GHE Copilot OAuth");
  }
  return stripTrailingSlashes(value.trim());
}

export const gheCopilot = {
  config: GHE_COPILOT_CONFIG,
  flowType: "device_code" as const,
  requestDeviceCode: async (config: any) => {
    const gheUrl = normalizeGheUrl(config.gheUrl);
    const response = await safeOutboundFetch(`${gheUrl}/login/device/code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        scope: config.scopes,
      }),
      guard: "block-metadata",
      pinDns: true,
      allowRedirect: false,
      retry: false,
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Device code request failed: ${error}`);
    }
    return await response.json();
  },
  pollToken: async (config: any, deviceCode: string, _codeVerifier?: string, extraData?: any) => {
    const gheUrl = normalizeGheUrl(extraData?.gheUrl || config.gheUrl);
    const response = await safeOutboundFetch(`${gheUrl}/login/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
      guard: "block-metadata",
      pinDns: true,
      allowRedirect: false,
      retry: false,
    });
    let data;
    try {
      data = await response.json();
    } catch {
      const text = await response.text();
      data = { error: "invalid_response", error_description: sanitizeErrorMessage(text) };
    }
    return {
      ok: response.ok,
      data: data,
    };
  },
  postExchange: async (tokens: any, extra?: any) => {
    const gheUrl = normalizeGheUrl(extra?.gheUrl);
    const copilotRes = await safeOutboundFetch(`${gheUrl}/api/v3/copilot_internal/v2/token`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/json",
        "X-GitHub-Api-Version": GHE_COPILOT_CONFIG.apiVersion,
        "User-Agent": getGitHubCopilotChatUserAgent(),
      },
      guard: "block-metadata",
      pinDns: true,
      allowRedirect: false,
      retry: false,
    });
    const copilotToken = copilotRes.ok ? await copilotRes.json() : {};
    const userRes = await safeOutboundFetch(`${gheUrl}/api/v3/user`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: "application/json",
        "X-GitHub-Api-Version": GHE_COPILOT_CONFIG.apiVersion,
        "User-Agent": getGitHubCopilotChatUserAgent(),
      },
      guard: "block-metadata",
      pinDns: true,
      allowRedirect: false,
      retry: false,
    });
    const userInfo = userRes.ok ? await userRes.json() : {};
    return {
      copilotToken,
      userInfo,
      gheUrl: extra?.gheUrl,
      // endpoints.api → chat/completions + /models catalog (real chat models).
      // endpoints.proxy → NES/autocomplete only. Capture both; chat + discovery
      // use the api host.
      copilotApiUrl: copilotToken?.endpoints?.api,
      copilotProxyUrl: copilotToken?.endpoints?.proxy,
    };
  },
  mapTokens: (tokens: any, extra?: any) => ({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    providerSpecificData: {
      autoSync: true,
      gheUrl: extra?.gheUrl,
      copilotApiUrl: extra?.copilotApiUrl || extra?.copilotToken?.endpoints?.api,
      copilotProxyUrl: extra?.copilotProxyUrl || extra?.copilotToken?.endpoints?.proxy,
      copilotToken: extra?.copilotToken?.token,
      copilotTokenExpiresAt: extra?.copilotToken?.expires_at,
      githubUserId: extra?.userInfo?.id,
      githubLogin: extra?.userInfo?.login,
      githubName: extra?.userInfo?.name,
      githubEmail: extra?.userInfo?.email,
    },
  }),
};
