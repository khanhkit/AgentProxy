// Allow large audio/video file uploads — 5min for processing large files (up to 2GB)
export const maxDuration = 300;
import { handleAudioTranscription } from "@omniroute/open-sse/handlers/audioTranscription.ts";
import {
  getProviderCredentialsWithQuotaPreflight,
  clearRecoveredProviderState,
} from "@/sse/services/auth";
import {
  parseTranscriptionModel,
  getTranscriptionProvider,
  audioModelAliasCandidates,
  findAlternateAudioProvider,
  listAlternateAudioModelIds,
  missingAudioProviderCredentialsMessage,
  AUDIO_TRANSCRIPTION_PROVIDERS,
} from "@omniroute/open-sse/config/audioRegistry.ts";
import { resolveDynamicAudioProviders } from "@/app/api/v1/_shared/audioProviderNodes";
import { errorResponse } from "@omniroute/open-sse/utils/error.ts";
import { HTTP_STATUS } from "@omniroute/open-sse/config/constants.ts";
import { enforceApiKeyPolicy, type ApiKeyMetadata } from "@/shared/utils/apiKeyPolicy";
import {
  isAllRateLimitedCredentials,
  rateLimitedProviderResponse,
} from "@/app/api/v1/_shared/rateLimit";
import { attachOmniRouteMetaToResponse } from "@/domain/omnirouteResponseMeta";
import { generateRequestId } from "@/shared/utils/requestId";
import { calculateModalCost } from "@/lib/usage/costCalculator";
import { saveCallLog } from "@/lib/usage/callLogs";
import { saveRequestUsage } from "@/lib/usage/usageHistory";
import { resolveUploadedAudioDurationSeconds } from "@/lib/usage/audioDuration";
import { recordCost } from "@/domain/costRules";
import { getComboByName, getCombos } from "@/lib/db/combos";
import { getDatabaseSettings } from "@/lib/db/databaseSettings";
import { handleComboChat } from "@omniroute/open-sse/services/combo.ts";
import { log } from "@omniroute/open-sse/utils/logger.ts";

/**
 * Copy a multipart body, swapping only the `model` field. Combo fan-out needs one
 * body per target, and the uploaded file part is reused as-is (a Blob can be read
 * more than once).
 */
function withModel(formData: FormData, modelStr: string): FormData {
  const next = new FormData();
  for (const [key, value] of formData.entries()) {
    if (key === "model") continue;
    next.append(key, value as string | Blob);
  }
  next.set("model", modelStr);
  return next;
}

type TranscriptionTelemetryContext = {
  apiKeyInfo: ApiKeyMetadata | null;
  requestedModel: string;
  audioDurationSeconds: number | null;
  contentType: string | null;
  sizeBytes: number | null;
  comboName?: string | null;
};

function resolveConnectionId(credentials: unknown): string | null {
  if (!credentials || typeof credentials !== "object") return null;
  const value = (credentials as { connectionId?: unknown }).connectionId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function finalizeTranscriptionResponse({
  response,
  provider,
  model,
  credentials,
  startTime,
  telemetry,
}: {
  response: Response;
  provider: string;
  model: string;
  credentials: unknown;
  startTime: number;
  telemetry: TranscriptionTelemetryContext;
}): Promise<Response> {
  const latencyMs = Date.now() - startTime;
  const connectionId = resolveConnectionId(credentials);
  const costUsd = response.ok
    ? await calculateModalCost("audio", provider, model, {
        seconds: telemetry.audioDurationSeconds ?? 0,
      })
    : 0;
  const timestamp = new Date().toISOString();
  const status = response.status;

  await Promise.allSettled([
    saveCallLog({
      method: "POST",
      path: "/v1/audio/transcriptions",
      status,
      model,
      requestedModel: telemetry.requestedModel,
      provider,
      connectionId,
      duration: latencyMs,
      requestType: "audio_transcription",
      requestBody: {
        ...(telemetry.audioDurationSeconds !== null
          ? { audioDurationSeconds: telemetry.audioDurationSeconds }
          : {}),
        ...(telemetry.contentType ? { contentType: telemetry.contentType } : {}),
        ...(telemetry.sizeBytes !== null ? { sizeBytes: telemetry.sizeBytes } : {}),
      },
      error: response.ok ? null : `Audio transcription failed with status ${status}`,
      apiKeyId: telemetry.apiKeyInfo?.id || null,
      apiKeyName: telemetry.apiKeyInfo?.name || null,
      noLog: telemetry.apiKeyInfo?.noLog === true,
      comboName: telemetry.comboName || null,
    }),
    saveRequestUsage({
      provider,
      model,
      status: String(status),
      success: response.ok,
      latencyMs,
      timeToFirstTokenMs: latencyMs,
      errorCode: response.ok ? null : String(status),
      timestamp,
      connectionId,
      apiKeyId: telemetry.apiKeyInfo?.id || null,
      apiKeyName: telemetry.apiKeyInfo?.name || null,
      endpoint: "/v1/audio/transcriptions",
    }),
  ]);

  if (response.ok && costUsd > 0 && telemetry.apiKeyInfo?.id) {
    recordCost(telemetry.apiKeyInfo.id, costUsd);
  }

  if (!response.ok) return response;

  await clearRecoveredProviderState(credentials);
  return attachOmniRouteMetaToResponse(response, {
    provider,
    model,
    costUsd,
    latencyMs,
    requestId: generateRequestId(),
  });
}

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
 * Transcribe with one concrete `provider/model` string. Split out of POST so combo
 * fan-out can invoke it once per target.
 */
async function transcribeWithModel(
  formData: FormData,
  modelStr: string,
  startTime: number,
  telemetry: TranscriptionTelemetryContext
): Promise<Response> {
  // Provider nodes eligible for transcription: this route's own audio type plus
  // general chat/responses gateways. Remote hosts are opt-in (default OFF).
  const dynamicProviders = await resolveDynamicAudioProviders(
    "/audio/transcriptions",
    "audio-transcriptions"
  );

  const parsed = parseTranscriptionModel(modelStr, dynamicProviders);
  let provider = parsed.provider;
  let resolvedModel = parsed.model;
  if (!provider) {
    const response = errorResponse(
      HTTP_STATUS.BAD_REQUEST,
      `Invalid transcription model: ${modelStr}. Use format: provider/model`
    );
    return finalizeTranscriptionResponse({
      response,
      provider: "unknown",
      model: modelStr,
      credentials: null,
      startTime,
      telemetry,
    });
  }

  // Check provider config — hardcoded first, then dynamic
  let providerConfig =
    getTranscriptionProvider(provider) || dynamicProviders.find((dp) => dp.id === provider) || null;

  // Get credentials — skip for local providers (authType: "none").
  // A dynamic node is addressed by its prefix but stores connections under the node
  // id, so credentials must be looked up under `credentialProviderId` when present.
  let credentials = null;
  if (providerConfig && providerConfig.authType !== "none") {
    const credentialKey = providerConfig.credentialProviderId || provider;
    // NOTE: the 2nd arg of this helper is `excludeConnectionId`, not "use this
    // connection" — a combo target's connectionId must never be passed here.
    credentials = await getProviderCredentialsWithQuotaPreflight(credentialKey);
    // Prefix match wins (`deepgram/nova-3` → native Deepgram). If that
    // provider has no credentials, retry gateways that list the same nested
    // model id (e.g. OpenRouter's `deepgram/nova-3`).
    if (!credentials) {
      const candidates = audioModelAliasCandidates(modelStr, provider, resolvedModel);
      const alternate = findAlternateAudioProvider(
        AUDIO_TRANSCRIPTION_PROVIDERS,
        provider,
        candidates
      );
      if (alternate) {
        const alternateCredentials = await getProviderCredentialsWithQuotaPreflight(
          alternate.provider
        );
        if (alternateCredentials && !isAllRateLimitedCredentials(alternateCredentials)) {
          provider = alternate.provider;
          resolvedModel = alternate.model;
          providerConfig = alternate.config;
          credentials = alternateCredentials;
        }
      }
    }
    if (!credentials) {
      const candidates = audioModelAliasCandidates(modelStr, provider, resolvedModel);
      const response = errorResponse(
        HTTP_STATUS.BAD_REQUEST,
        missingAudioProviderCredentialsMessage(
          provider,
          listAlternateAudioModelIds(AUDIO_TRANSCRIPTION_PROVIDERS, provider, candidates)
        )
      );
      return finalizeTranscriptionResponse({
        response,
        provider,
        model: resolvedModel || modelStr,
        credentials: null,
        startTime,
        telemetry,
      });
    }
    if (isAllRateLimitedCredentials(credentials)) {
      const response = rateLimitedProviderResponse(provider, credentials);
      return finalizeTranscriptionResponse({
        response,
        provider,
        model: resolvedModel || modelStr,
        credentials,
        startTime,
        telemetry,
      });
    }
  }

  const response = await handleAudioTranscription({
    formData,
    credentials,
    resolvedProvider: providerConfig,
    resolvedModel,
  });
  return finalizeTranscriptionResponse({
    response,
    provider,
    model: resolvedModel || modelStr,
    credentials,
    startTime,
    telemetry,
  });
}

/**
 * POST /v1/audio/transcriptions — transcribe audio files
 * OpenAI Whisper API compatible (multipart/form-data)
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
  const modelStr = String(model);

  // Enforce API key policies (model restrictions + budget limits)
  const policy = await enforceApiKeyPolicy(request, modelStr);
  if (policy.rejection) return policy.rejection;

  const uploadedFile = formData.get("file");
  const audioDurationSeconds = await resolveUploadedAudioDurationSeconds(uploadedFile);
  const telemetry: TranscriptionTelemetryContext = {
    apiKeyInfo: policy.apiKeyInfo,
    requestedModel: modelStr,
    audioDurationSeconds,
    contentType:
      uploadedFile instanceof Blob && uploadedFile.type.trim().length > 0 ? uploadedFile.type : null,
    sizeBytes: uploadedFile instanceof Blob ? uploadedFile.size : null,
  };

  // A bare name (no "/") may be a combo. /v1/models advertises combos, and chat and
  // embeddings both resolve them — resolving here too keeps the catalog honest and
  // frees callers from hardcoding a provider's internal model id.
  if (!modelStr.includes("/")) {
    try {
      const combo = await getComboByName(modelStr);
      if (combo) {
        let allCombos: Awaited<ReturnType<typeof getCombos>> = [];
        try {
          allCombos = await getCombos();
        } catch {}
        let settings = {};
        try {
          settings = getDatabaseSettings();
        } catch {}

        return handleComboChat({
          body: { model: modelStr } as any,
          combo: combo as any,
          handleSingleModel: async (_reqBody: any, targetModelStr: string) =>
            transcribeWithModel(withModel(formData, targetModelStr), targetModelStr, startTime, {
              ...telemetry,
              comboName: modelStr,
            }),
          isModelAvailable: undefined,
          log,
          settings,
          allCombos: allCombos as any,
          relayOptions: undefined,
          signal: undefined,
        } as any);
      }
    } catch (err) {
      log.error("AUDIO", `Combo resolution failed for ${modelStr}: ${err}`);
    }
  }

  return transcribeWithModel(formData, modelStr, startTime, telemetry);
}
