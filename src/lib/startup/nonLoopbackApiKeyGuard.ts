const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"]);

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

function isRequireApiKeyDisabled(): boolean {
  const raw = (process.env.REQUIRE_API_KEY || "").trim().toLowerCase();
  return raw !== "true" && raw !== "1" && raw !== "yes";
}

function warnIfNonLoopbackWithoutApiKey(serverLabel: string, host: string): void {
  if (isLoopbackHost(host) || !isRequireApiKeyDisabled()) return;

  console.warn(
    `[startup] ${serverLabel} is bound to non-loopback host "${host}" while ` +
      "REQUIRE_API_KEY is disabled — this exposes the anonymous /v1 proxy to " +
      "every reachable network interface. Set REQUIRE_API_KEY=true, bind to " +
      "127.0.0.1, or enforce authentication in a trusted reverse proxy."
  );
}

export const MAIN_SERVER_DEFAULT_HOST = "0.0.0.0";

/** Resolve the host used by the Next server that serves /v1 inference. */
export function resolveMainServerHost(): string {
  return process.env.AGENTPROXY_BOUND_HOST || process.env.HOSTNAME || MAIN_SERVER_DEFAULT_HOST;
}

/** Warn, without blocking startup, when /v1 inference is exposed without API-key auth. */
export function warnIfInferenceServerExposed(): void {
  warnIfNonLoopbackWithoutApiKey(
    "Dashboard/API server (serves /v1 inference)",
    resolveMainServerHost()
  );
}
