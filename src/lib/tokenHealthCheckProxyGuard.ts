import { resolveProxyForConnection } from "@/lib/db/settings";
import { hasBlockingProxyAssignment } from "@/lib/db/proxies";

function extractProxyConfig(resolved: unknown): unknown {
  if (resolved && typeof resolved === "object" && !Array.isArray(resolved) && "proxy" in resolved) {
    return (resolved as { proxy?: unknown }).proxy ?? null;
  }
  return resolved ?? null;
}

/** Fail closed when background refresh would bypass a dead assigned proxy pool. */
export async function resolveGuardedProxyConfig(
  connectionId: string,
  provider?: string
): Promise<{ proxyConfig: unknown; blocked: boolean }> {
  const resolved = await resolveProxyForConnection(connectionId);
  const proxyConfig = extractProxyConfig(resolved);
  if (!proxyConfig && hasBlockingProxyAssignment(connectionId, provider)) {
    return { proxyConfig: null, blocked: true };
  }
  return { proxyConfig, blocked: false };
}
