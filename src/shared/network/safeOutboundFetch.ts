import dns from "node:dns";
import { isIP } from "node:net";
import {
  runWithProxyContext,
  getOriginalFetch,
  hasAmbientProxyContext,
} from "@omniroute/open-sse/utils/proxyFetch.ts";
import { FetchTimeoutError, fetchWithTimeout } from "@/shared/utils/fetchTimeout";
import {
  OutboundUrlGuardError,
  type OutboundUrlGuardMode,
  isCloudMetadataHost,
  isPrivateHost,
  parseAndValidateNonMetadataUrl,
  parseAndValidatePublicUrl,
  parseOutboundUrl,
} from "@/shared/network/outboundUrlGuard";
import { createPinnedFetch } from "@/shared/network/remoteImageFetch";

const DEFAULT_IDEMPOTENT_METHODS = ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"];

// Some upstream providers (Cerebras, Cloudflare AI, Groq observed in practice) routinely take
// close to 5s to answer a lightweight /models probe, which is indistinguishable from a real
// outage under the previous fixed 5000ms budget — the connection flaps between "active" and
// "error" in the dashboard/topology view purely from being near the edge of the timeout, not
// from any real failure. Configurable via env so it can be tuned per-deployment without a code
// change; default raised from 5000ms to 8000ms to give slow-but-healthy providers headroom.
function resolveProbeTimeoutMs(): number {
  const parsed = parseInt(process.env.OMNIROUTE_PROVIDER_PROBE_TIMEOUT_MS || "", 10);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 8000;
}
const PROVIDER_PROBE_TIMEOUT_MS = resolveProbeTimeoutMs();

export type SafeOutboundFetchGuard = OutboundUrlGuardMode;
export type SafeOutboundFetchErrorCode =
  | "INVALID_URL"
  | "URL_GUARD_BLOCKED"
  | "TIMEOUT"
  | "REDIRECT_BLOCKED"
  | "NETWORK_ERROR";

export interface SafeOutboundFetchRetryOptions {
  attempts?: number;
  backoffMs?: number | number[];
  methods?: string[];
  statusCodes?: number[];
}

export type SafeOutboundDnsLookup = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>;

export interface SafeOutboundFetchOptions extends RequestInit {
  timeoutMs?: number;
  allowRedirect?: boolean;
  retry?: SafeOutboundFetchRetryOptions | false;
  guard?: SafeOutboundFetchGuard;
  proxyConfig?: unknown;
  /** Validate DNS answers before egress and pin direct connections to one validated answer. */
  pinDns?: boolean;
  /** Test seam / custom resolver for DNS validation. */
  dnsLookup?: SafeOutboundDnsLookup;
  /** Test seam / caller-provided transport. Production callers normally leave this unset. */
  fetchImpl?: typeof fetch;
  /** Bypass the global proxy/TLS patched fetch and use the native Node.js
   *  fetch directly. Use when a provider endpoint has compatibility issues
   *  with the undici dispatcher layer. */
  bypassProxyPatch?: boolean;
}

type SafeOutboundFetchPresetMap = {
  validationRead: SafeOutboundFetchOptions;
  validationWrite: SafeOutboundFetchOptions;
  modelsProbe: SafeOutboundFetchOptions;
  modelsDiscovery: SafeOutboundFetchOptions;
  modelsPagination: SafeOutboundFetchOptions;
};

export const SAFE_OUTBOUND_FETCH_PRESETS: SafeOutboundFetchPresetMap = {
  validationRead: {
    timeoutMs: PROVIDER_PROBE_TIMEOUT_MS,
    allowRedirect: false,
    retry: {
      attempts: 2,
      backoffMs: [150],
      methods: ["GET", "HEAD"],
    },
  },
  validationWrite: {
    timeoutMs: 15000,
    allowRedirect: false,
    retry: false,
  },
  modelsProbe: {
    timeoutMs: PROVIDER_PROBE_TIMEOUT_MS,
    allowRedirect: false,
    retry: {
      attempts: 2,
      backoffMs: [150],
      methods: ["GET", "HEAD"],
    },
  },
  modelsDiscovery: {
    timeoutMs: 10000,
    allowRedirect: false,
    retry: {
      attempts: 2,
      backoffMs: [200],
      methods: ["GET", "HEAD"],
    },
  },
  modelsPagination: {
    timeoutMs: 15000,
    allowRedirect: false,
    retry: {
      attempts: 2,
      backoffMs: [250],
      methods: ["GET", "HEAD"],
    },
  },
};

type SafeOutboundFetchErrorInit = {
  code: SafeOutboundFetchErrorCode;
  url: string;
  method: string;
  attempts: number;
  isRetryable: boolean;
  timeoutMs?: number;
  status?: number;
  location?: string | null;
  cause?: unknown;
};

export class SafeOutboundFetchError extends Error {
  code: SafeOutboundFetchErrorCode;
  url: string;
  method: string;
  attempts: number;
  isRetryable: boolean;
  timeoutMs?: number;
  status?: number;
  location?: string | null;

  constructor(message: string, init: SafeOutboundFetchErrorInit) {
    super(message);
    this.name = "SafeOutboundFetchError";
    this.code = init.code;
    this.url = init.url;
    this.method = init.method;
    this.attempts = init.attempts;
    this.isRetryable = init.isRetryable;
    this.timeoutMs = init.timeoutMs;
    this.status = init.status;
    this.location = init.location ?? null;
    if (init.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = init.cause;
    }
  }
}

function normalizeMethod(method?: string) {
  return (method || "GET").toUpperCase();
}

function normalizeUrl(input: string | URL) {
  try {
    return parseOutboundUrl(input);
  } catch (error) {
    if (error instanceof OutboundUrlGuardError) {
      throw new SafeOutboundFetchError(error.message, {
        code: error.code === "OUTBOUND_URL_INVALID" ? "INVALID_URL" : "URL_GUARD_BLOCKED",
        url: error.url,
        method: "GET",
        attempts: 1,
        isRetryable: false,
        cause: error,
      });
    }
    throw new SafeOutboundFetchError(`Invalid outbound URL: ${String(input)}`, {
      code: "INVALID_URL",
      url: String(input),
      method: "GET",
      attempts: 1,
      isRetryable: false,
      cause: error,
    });
  }
}

function applyUrlGuard(targetUrl: URL, guard: SafeOutboundFetchGuard, method: string) {
  if (guard === "none") return;

  try {
    // "public-only" rejects every private host; "block-metadata" (#5066) allows private/LAN
    // hosts but still rejects cloud-metadata / link-local endpoints.
    if (guard === "block-metadata") {
      parseAndValidateNonMetadataUrl(targetUrl);
    } else {
      parseAndValidatePublicUrl(targetUrl);
    }
  } catch (error) {
    if (error instanceof OutboundUrlGuardError) {
      throw new SafeOutboundFetchError(error.message, {
        code: error.code === "OUTBOUND_URL_INVALID" ? "INVALID_URL" : "URL_GUARD_BLOCKED",
        url: error.url,
        method,
        attempts: 1,
        isRetryable: false,
        cause: error,
      });
    }
    throw error;
  }
}

const defaultDnsLookup: SafeOutboundDnsLookup = (hostname) =>
  dns.promises.lookup(hostname, { all: true });

function isIpv6LinkLocal(address: string): boolean {
  const normalized = address.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "").split("%")[0];
  if (isIP(normalized) !== 6) return false;
  const first = Number.parseInt(normalized.split(":", 1)[0] || "0", 16);
  return Number.isFinite(first) && (first & 0xffc0) === 0xfe80;
}

function isBlockedResolvedAddress(address: string, guard: SafeOutboundFetchGuard): boolean {
  if (guard === "public-only") return isPrivateHost(address);
  if (guard === "block-metadata") {
    return isCloudMetadataHost(address) || isIpv6LinkLocal(address);
  }
  return false;
}

async function resolveValidatedDns(
  targetUrl: URL,
  guard: SafeOutboundFetchGuard,
  lookup: SafeOutboundDnsLookup,
  method: string
): Promise<Array<{ address: string; family: number }>> {
  if (guard === "none") return [];

  const hostname = targetUrl.hostname.startsWith("[") && targetUrl.hostname.endsWith("]")
    ? targetUrl.hostname.slice(1, -1)
    : targetUrl.hostname;
  if (!hostname) return [];

  let resolved: Array<{ address: string; family: number }>;
  if (isIP(hostname)) {
    resolved = [{ address: hostname, family: isIP(hostname) }];
  } else {
    try {
      resolved = await lookup(hostname);
    } catch (cause) {
      throw new SafeOutboundFetchError(`Outbound host could not be resolved: ${hostname}`, {
        code: "NETWORK_ERROR",
        url: targetUrl.toString(),
        method,
        attempts: 1,
        isRetryable: true,
        cause,
      });
    }
  }

  if (!resolved.length) {
    throw new SafeOutboundFetchError(`Outbound host could not be resolved: ${hostname}`, {
      code: "NETWORK_ERROR",
      url: targetUrl.toString(),
      method,
      attempts: 1,
      isRetryable: true,
    });
  }

  for (const answer of resolved) {
    if (isBlockedResolvedAddress(answer.address, guard)) {
      throw new SafeOutboundFetchError(
        `Outbound host resolves to a blocked address: ${answer.address}`,
        {
          code: "URL_GUARD_BLOCKED",
          url: targetUrl.toString(),
          method,
          attempts: 1,
          isRetryable: false,
        }
      );
    }
  }

  return resolved;
}

function getRetryConfig(retry: SafeOutboundFetchRetryOptions | false | undefined, method: string) {
  if (retry === false) {
    return {
      attempts: 1,
      shouldRetryMethod: false,
      statusCodes: new Set<number>(),
      backoffMs: [] as number[],
    };
  }

  const methods = new Set(
    (retry?.methods || DEFAULT_IDEMPOTENT_METHODS).map((value) => value.toUpperCase())
  );
  const attempts = Math.max(1, retry?.attempts || 1);
  const backoffMs = Array.isArray(retry?.backoffMs)
    ? retry?.backoffMs
    : typeof retry?.backoffMs === "number"
      ? [retry.backoffMs]
      : [];
  const statusCodes = new Set(retry?.statusCodes || []);

  return {
    attempts,
    shouldRetryMethod: methods.has(method),
    statusCodes,
    backoffMs,
  };
}

function getBackoffDelay(backoffMs: number[], attemptNumber: number) {
  if (backoffMs.length === 0) return 0;
  return backoffMs[Math.min(attemptNumber - 1, backoffMs.length - 1)] || 0;
}

function sleep(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cancelResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    // Ignore body cancellation errors when preparing a retry.
  }
}

function normalizeFetchFailure(
  error: unknown,
  targetUrl: string,
  method: string,
  attempts: number
): SafeOutboundFetchError {
  if (error instanceof SafeOutboundFetchError) {
    error.attempts = attempts;
    return error;
  }

  if (error instanceof FetchTimeoutError) {
    return new SafeOutboundFetchError(error.message, {
      code: "TIMEOUT",
      url: targetUrl,
      method,
      attempts,
      timeoutMs: error.timeoutMs,
      isRetryable: true,
      cause: error,
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === "object" ? (error as { code?: string }).code : undefined;

  return new SafeOutboundFetchError(message || `Outbound request failed for ${targetUrl}`, {
    code: "NETWORK_ERROR",
    url: targetUrl,
    method,
    attempts,
    isRetryable: code !== "PROXY_UNREACHABLE",
    cause: error,
  });
}

export async function safeOutboundFetch(url: string | URL, options: SafeOutboundFetchOptions = {}) {
  const targetUrl = normalizeUrl(url);
  const method = normalizeMethod(options.method);
  const {
    timeoutMs,
    allowRedirect = false,
    retry,
    guard = "none",
    proxyConfig,
    pinDns = false,
    dnsLookup = defaultDnsLookup,
    fetchImpl,
    bypassProxyPatch = false,
    signal,
    ...fetchOptions
  } = options;

  applyUrlGuard(targetUrl, guard, method);

  const resolvedAddresses = pinDns
    ? await resolveValidatedDns(targetUrl, guard, dnsLookup, method)
    : [];
  const proxyIsActive = Boolean(proxyConfig) || hasAmbientProxyContext();

  const retryConfig = getRetryConfig(retry, method);
  const redirect = allowRedirect ? (fetchOptions.redirect ?? "follow") : "manual";

  for (let attempt = 1; attempt <= retryConfig.attempts; attempt++) {
    try {
      const executeFetch = () => {
        // Do not silently bypass an assigned/ambient proxy merely to obtain DNS
        // pinning. Direct egress pins to the already-validated answer; proxied
        // egress retains the proxy route after local DNS pre-validation.
        const pinnedFetch =
          pinDns && resolvedAddresses.length > 0 && !proxyIsActive && !fetchImpl
            ? createPinnedFetch(resolvedAddresses[0].address, resolvedAddresses[0].family)
            : undefined;
        const selectedFetch =
          fetchImpl || pinnedFetch || (bypassProxyPatch ? getOriginalFetch() : undefined);

        return fetchWithTimeout(targetUrl.toString(), {
          ...fetchOptions,
          method,
          redirect,
          signal,
          timeoutMs,
          fetchFn: selectedFetch,
        });
      };

      const response = bypassProxyPatch && !proxyConfig
        ? await executeFetch()
        : proxyConfig
          ? await runWithProxyContext(proxyConfig, executeFetch)
          : await executeFetch();

      if (!allowRedirect && response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await cancelResponseBody(response);
        throw new SafeOutboundFetchError(
          `Redirect blocked for ${method} ${targetUrl.toString()} (${response.status})`,
          {
            code: "REDIRECT_BLOCKED",
            url: targetUrl.toString(),
            method,
            attempts: attempt,
            status: response.status,
            location,
            isRetryable: false,
          }
        );
      }

      if (
        retryConfig.shouldRetryMethod &&
        attempt < retryConfig.attempts &&
        retryConfig.statusCodes.has(response.status)
      ) {
        await cancelResponseBody(response);
        await sleep(getBackoffDelay(retryConfig.backoffMs, attempt));
        continue;
      }

      return response;
    } catch (error) {
      const normalizedError = normalizeFetchFailure(error, targetUrl.toString(), method, attempt);
      const shouldRetry =
        retryConfig.shouldRetryMethod &&
        attempt < retryConfig.attempts &&
        normalizedError.isRetryable;

      if (!shouldRetry) {
        throw normalizedError;
      }

      await sleep(getBackoffDelay(retryConfig.backoffMs, attempt));
    }
  }

  throw new SafeOutboundFetchError(`Outbound request failed for ${targetUrl.toString()}`, {
    code: "NETWORK_ERROR",
    url: targetUrl.toString(),
    method,
    attempts: retryConfig.attempts,
    isRetryable: false,
  });
}

export function getSafeOutboundFetchErrorStatus(error: unknown) {
  if (!(error instanceof SafeOutboundFetchError)) return null;

  if (error.code === "TIMEOUT") return 504;
  if (
    error.code === "INVALID_URL" ||
    error.code === "URL_GUARD_BLOCKED" ||
    error.code === "REDIRECT_BLOCKED"
  ) {
    return 503;
  }

  return null;
}
