import { getRegistryEntry } from "@agentproxy/open-sse/config/providerRegistry.ts";
import { normalizeBaseUrl } from "./urlHelpers";
import { buildBearerHeaders } from "./headers";
import { validateDirectChatProvider } from "./directChatProbe";

export const ZYLO_DEFAULT_VALIDATION_MODEL_ID = "gpt-oss";

export function resolveZyloChatUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return "";

  const cleaned = normalized
    .replace(/\/chat\/completions$/, "")
    .replace(/\/models$/, "")
    .replace(/\/v1$/, "");

  return `${cleaned}/v1/chat/completions`;
}

export async function validateZyloApiProvider({ apiKey, providerSpecificData = {} }: any) {
  const configuredBaseUrl =
    normalizeBaseUrl(providerSpecificData.baseUrl) ||
    getRegistryEntry("zylo-api")?.baseUrl ||
    "https://api.zyloai.net/v1/chat/completions";

  return validateDirectChatProvider({
    url: resolveZyloChatUrl(configuredBaseUrl),
    headers: buildBearerHeaders(apiKey, providerSpecificData),
    body: {
      model: providerSpecificData.validationModelId || ZYLO_DEFAULT_VALIDATION_MODEL_ID,
      messages: [{ role: "user", content: "test" }],
      max_tokens: 1,
    },
    providerSpecificData,
  });
}
