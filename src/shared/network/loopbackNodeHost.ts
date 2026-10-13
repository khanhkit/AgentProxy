/**
 * Loopback classification for OpenAI-compatible `provider_nodes`.
 *
 * "Loopback" here means the operator's own machine: `localhost` or `127.0.0.1`.
 * Private Docker/LAN ranges are not inherently local to this process and must pass the
 * same explicit remote-node / outbound-URL policy as every other non-loopback host.
 * `::1` stays excluded, matching the SSRF hardening that introduced the check.
 *
 * This module is deliberately pure — no DB, no env, no `node:` imports — so registries
 * under `open-sse/config/` that may be reached from a browser bundle can import it
 * (cf. #11122 for why `privateHost.ts` is split the same way). Policy-aware helpers that
 * consult feature flags live in `./providerNodeHost.ts`.
 */

/** Hosts reachable only from the operator's machine. */
export function isLoopbackNodeHost(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    // Block credentials in URL to prevent SSRF via user@host (e.g., http://localhost@evil.com)
    if (u.username || u.password) return false;
    // Note: URL.hostname returns "[::1]" WITH brackets for IPv6 — both forms stay excluded.
    // Strictly matching 172.16.0.0/12 (Docker/local) and explicitly blocking ::1 per SSRF hardening
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
