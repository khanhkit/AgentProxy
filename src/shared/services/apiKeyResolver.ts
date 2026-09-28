import { recoverApiKeyById, createApiKey } from "@/lib/db/apiKeys";
import { getConsistentMachineId } from "@/shared/utils/machineId";

export async function resolveApiKey(
  apiKeyId?: string | null,
  apiKey?: string | null
): Promise<string> {
  if (apiKeyId) {
    try {
      const recovered = await recoverApiKeyById(apiKeyId);
      if (recovered) return recovered;
    } catch {
      /* fall through */
    }
  }
  return apiKey || "sk_agentproxy";
}

/**
 * Get or create a DB-backed API key for CLI tool setup.
 * Returns a valid AgentProxy API key (not a placeholder like "sk_agentproxy").
 * Used when user has not explicitly selected a key from API Keys.
 */
export async function getOrCreateApiKey(apiKeyId?: string | null): Promise<string> {
  if (apiKeyId) {
    try {
      const recovered = await recoverApiKeyById(apiKeyId);
      if (recovered) return recovered;
    } catch {
      /* fall through */
    }
  }

  // No key found — auto-create one that will be valid in DB validation
  let machineId = "unknown";
  try {
    machineId = await getConsistentMachineId();
    const keyRecord = await createApiKey("CLI Auto-Key", machineId);
    return keyRecord.key as string;
  } catch {
    // Fallback: generate a deterministic key if DB write fails
    return `sk-${machineId}-fallback-${Date.now()}`;
  }
}
