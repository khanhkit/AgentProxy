import { getApiKeys } from "@/lib/db/apiKeys";
import { getProviderConnections } from "@/lib/db/providers";
import { createRustCoreSnapshotHandler } from "@/lib/rustCore/snapshotRoute";
import { getProviderModels } from "@omniroute/open-sse/config/providerModels";
import { CODEX_NATIVE_UNPREFIXED_MODELS } from "@omniroute/open-sse/services/model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handle = createRustCoreSnapshotHandler({
  getConnections: () => getProviderConnections({ provider: "codex", isActive: true }),
  getApiKeys: () => getApiKeys(),
  getEnvApiKey: () => process.env.AGENTPROXY_API_KEY || process.env.OMNIROUTE_API_KEY || process.env.ROUTER_API_KEY || null,
  getCodexCatalogModels: () => getProviderModels("codex").map((model) => model.id),
  getCodexNativeModels: () => [...CODEX_NATIVE_UNPREFIXED_MODELS],
});

export async function GET(request: Request) {
  return handle(request);
}
