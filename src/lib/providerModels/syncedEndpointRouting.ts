import { getAllCustomModels, getSyncedAvailableModelsByConnection } from "@/lib/db/models";
import { isSelfHostedChatProvider, resolveProviderId } from "@/shared/constants/providers";

export type LocalSyncedEndpointRoute = {
  provider: string;
  model: string;
  connectionIds: string[];
};

export async function resolveLocalSyncedEndpointRoute(
  modelStr: string,
  endpoint: "embeddings" | "images"
): Promise<LocalSyncedEndpointRoute | null> {
  const slashIndex = modelStr.indexOf("/");
  if (slashIndex <= 0 || slashIndex === modelStr.length - 1) return null;

  const providerPrefix = modelStr.slice(0, slashIndex);
  const provider = resolveProviderId(providerPrefix);
  if (!isSelfHostedChatProvider(provider)) return null;

  const rawSuffix = modelStr.slice(slashIndex + 1);
  const modelCandidates = rawSuffix.startsWith("/") ? [rawSuffix] : [rawSuffix, `/${rawSuffix}`];

  const customModelsForProvider = (await getAllCustomModels())[provider];
  const byConnection = await getSyncedAvailableModelsByConnection(provider);

  for (const model of modelCandidates) {
    const overrideEndpoints = Array.isArray(customModelsForProvider)
      ? (
          customModelsForProvider as Array<{ id?: unknown; supportedEndpoints?: unknown }>
        ).find((entry) => entry.id === modelStr || entry.id === `${providerPrefix}/${model}`)
          ?.supportedEndpoints
      : undefined;
    const hasOverride = Array.isArray(overrideEndpoints) && overrideEndpoints.includes(endpoint);

    const connectionIds = Object.entries(byConnection)
      .filter(([, models]) =>
        models.some(
          (candidate) =>
            candidate.id === model && (hasOverride || candidate.supportedEndpoints?.includes(endpoint))
        )
      )
      .map(([connectionId]) => connectionId);

    if (connectionIds.length > 0) return { provider, model, connectionIds };
  }

  return null;
}
