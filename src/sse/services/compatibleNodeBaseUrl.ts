import { getCachedProviderNodes } from "@/lib/db/readCache";
import { selectProviderNodeForConnection } from "@/lib/db/providerNodeSelect";
import { isCompatibleProviderConnectionId } from "@/shared/utils/compatibleProviderId";

type JsonRecord = Record<string, unknown>;

export function hydrateCompatibleNodeBaseUrlFromNodes(
  provider: string,
  providerSpecificData: JsonRecord,
  nodes: Array<JsonRecord | null>
): JsonRecord {
  if (typeof providerSpecificData.baseUrl === "string" && providerSpecificData.baseUrl.trim()) {
    return providerSpecificData;
  }
  if (!isCompatibleProviderConnectionId(provider)) return providerSpecificData;
  const availableNodes = nodes.filter((node): node is JsonRecord => !!node);
  const node = selectProviderNodeForConnection(provider, availableNodes);
  if (!node || typeof node.baseUrl !== "string" || !node.baseUrl.trim()) {
    return providerSpecificData;
  }
  return {
    ...providerSpecificData,
    prefix: providerSpecificData.prefix ?? node.prefix,
    apiType: providerSpecificData.apiType ?? node.apiType,
    baseUrl: node.baseUrl.trim(),
    nodeName: providerSpecificData.nodeName ?? node.name,
    ...(node.chatPath && !providerSpecificData.chatPath ? { chatPath: node.chatPath } : {}),
    ...(node.modelsPath && !providerSpecificData.modelsPath ? { modelsPath: node.modelsPath } : {}),
    ...(node.customHeaders && !providerSpecificData.customHeaders
      ? { customHeaders: node.customHeaders }
      : {}),
  };
}

export async function hydrateCompatibleNodeBaseUrl(
  provider: string,
  providerSpecificData: JsonRecord
): Promise<JsonRecord> {
  try {
    return hydrateCompatibleNodeBaseUrlFromNodes(
      provider,
      providerSpecificData,
      await getCachedProviderNodes()
    );
  } catch {
    return providerSpecificData;
  }
}
