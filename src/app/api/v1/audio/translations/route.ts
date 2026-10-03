// Allow large audio/video file uploads — 5min for processing large files (up to 2GB)
export const maxDuration = 300;
import { handleAudioTranslation } from "@agentproxy/open-sse/handlers/audioTranslation.ts";
import {
  getProviderCredentialsWithQuotaPreflight,
  clearRecoveredProviderState,
} from "@/sse/services/auth";
import {
  parseTranslationModel,
  getTranslationProvider,
} from "@agentproxy/open-sse/config/audioRegistry.ts";
import { resolveDynamicAudioProviders } from "@/app/api/v1/_shared/audioProviderNodes";
import { errorResponse } from "@agentproxy/open-sse/utils/error.ts";
import { HTTP_STATUS } from "@agentproxy/open-sse/config/constants.ts";
import { enforceApiKeyPolicy } from "@/shared/utils/apiKeyPolicy";
import {
  isAllRateLimitedCredentials,
  rateLimitedProviderResponse,
} from "@/app/api/v1/_shared/rateLimit";
import { attachAgentProxyMetaToResponse } from "@/domain/agentproxyResponseMeta";
import { saveCallLog } from "@/lib/usage/callLogs";
import { generateRequestId } from "@/shared/utils/requestId";

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * POST /v1/audio/translations — translate audio to English text
 * OpenAI Whisper API compatible (multipart/form-data). Unlike
 * /v1/audio/transcriptions, output is always English regardless of the
 * source audio language.
 */
export async function POST(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid multipart form data");
  }

  const startTime = Date.now();

  const model = formData.get("model");
  if (!model) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }

  // Enforce API key policies (model restrictions + budget limits)
  const policy = await enforceApiKeyPolicy(request, model as string);
  if (policy.rejection) return policy.rejection;

  // Translation is served by the transcription-capable nodes (Whisper-style
  // endpoints expose both), plus general chat/responses gateways. Remote hosts are
  // opt-in (default OFF).
  const dynamicProviders = await resolveDynamicAudioProviders(
    "/audio/translations",
    "audio-transcriptions"
  );

  const { provider, model: resolvedModel } = parseTranslationModel(
    model as string,
    dynamicProviders
  );
  if (!provider) {
    return errorResponse(
      HTTP_STATUS.BAD_REQUEST,
      `Invalid translation model: ${model}. Use format: provider/model`
    );
  }

  // Check provider config — hardcoded first, then dynamic
  const providerConfig =
    getTranslationProvider(provider) || dynamicProviders.find((dp) => dp.id === provider) || null;

  // Get credentials — skip for local providers (authType: "none")
  let credentials = null;
  if (providerConfig && providerConfig.authType !== "none") {
    const credentialKey = providerConfig.credentialProviderId || provider;
    credentials = await getProviderCredentialsWithQuotaPreflight(credentialKey);
    if (!credentials) {
      return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
    }
    if (isAllRateLimitedCredentials(credentials)) {
      return rateLimitedProviderResponse(provider, credentials);
    }
  }

  let response = await handleAudioTranslation({
    formData,
    credentials,
    resolvedProvider: providerConfig,
    resolvedModel,
  });
  const latencyMs = Date.now() - startTime;
  const logModel = resolvedModel ? `${provider}/${resolvedModel}` : String(model);
  const connectionId = (credentials as { connectionId?: string } | null)?.connectionId || undefined;

  if (response?.ok) {
    await clearRecoveredProviderState(credentials);
    // No text body / playback duration available from the multipart upload, so
    // per-second pricing cannot be applied → cost 0 (ADD-only headers, body intact).
    response = attachAgentProxyMetaToResponse(response, {
      provider,
      model: resolvedModel,
      costUsd: 0,
      latencyMs,
      requestId: generateRequestId(),
    });
  }

  if (response) {
    saveCallLog({
      method: "POST",
      path: "/v1/audio/translations",
      status: response.status,
      model: logModel,
      provider,
      connectionId,
      duration: latencyMs,
      requestType: "audio_translation",
      error: response.ok ? null : `Audio translation failed with status ${response.status}`,
      apiKeyId: policy.apiKeyInfo?.id || null,
      apiKeyName: policy.apiKeyInfo?.name || null,
      noLog: policy.apiKeyInfo?.noLog === true,
    }).catch(() => {});
  }

  return response;
}
