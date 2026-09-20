// Unit-test simulation of the trusted authz pipeline locality stamp.
//
// Direct route-handler unit tests build synthetic localhost Request / NextRequest
// objects but do not traverse the custom Node server + authz pipeline that strips
// untrusted headers and stamps the verified peer locality in production.
//
// Fresh-install management auth intentionally stopped trusting URL Host alone.
// Preserve that production hardening by stamping only the narrow synthetic shape
// used by direct route tests: a loopback URL with NO explicit Host authority,
// forwarding evidence, peer stamp, proxy stamp, or pre-existing locality verdict.
//
// Security tests that model forged Host / proxy / peer evidence therefore remain
// fail-closed and continue to exercise the real production locality rules.
const NativeRequest = globalThis.Request;
const nativeHeadersGetter = Object.getOwnPropertyDescriptor(
  NativeRequest.prototype,
  "headers"
)?.get;

if (!nativeHeadersGetter) {
  throw new Error("Native Request.headers getter unavailable");
}

const LOCALITY_HEADER = "x-agentproxy-peer-locality";
const PEER_IP_HEADER = "x-agentproxy-peer-ip";
const VIA_PROXY_HEADER = "x-agentproxy-via-proxy";
const FORWARDING_HEADERS = ["forwarded", "x-forwarded-for", "x-real-ip", "cf-connecting-ip"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function shouldStamp(headers: Headers, rawUrl: string): boolean {
  if (headers.has(LOCALITY_HEADER)) return false;
  if (headers.has("host")) return false;
  if (headers.has(PEER_IP_HEADER) || headers.has(VIA_PROXY_HEADER)) return false;
  if (FORWARDING_HEADERS.some((name) => Boolean(headers.get(name)?.trim()))) return false;

  try {
    return LOOPBACK_HOSTS.has(new URL(rawUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function stampLocality(headers: Headers, rawUrl: string): Headers {
  if (shouldStamp(headers, rawUrl)) {
    headers.set(LOCALITY_HEADER, "loopback");
  }
  return headers;
}

function inputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();

  try {
    return String((input as Request).url);
  } catch {
    return "";
  }
}

class UnitPipelineRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init);

    // Use the native getter + constructor input instead of virtual this.headers
    // / this.url. NextRequest calls super() before its own internal URL slot
    // exists, so virtual dispatch here would read an uninitialized NextRequest.
    const headers = nativeHeadersGetter.call(this) as Headers;
    stampLocality(headers, inputUrl(input));
  }
}

globalThis.Request = UnitPipelineRequest;

// NextRequest may already have been evaluated by another preload. Patch its
// inherited headers getter as a fallback. During NextRequest construction the
// internal URL slot is not initialized yet; that access is intentionally ignored.
// Once construction completes, later route-handler header reads stamp the same
// narrow synthetic-localhost shape.
const { NextRequest } = await import("next/server");

let proto: object | null = NextRequest.prototype;
let inheritedHeaders: PropertyDescriptor | undefined;

while (proto && typeof inheritedHeaders?.get !== "function") {
  proto = Object.getPrototypeOf(proto);
  inheritedHeaders = proto ? Object.getOwnPropertyDescriptor(proto, "headers") : undefined;
}

if (typeof inheritedHeaders?.get !== "function") {
  throw new Error("NextRequest Request.headers getter unavailable");
}

Object.defineProperty(NextRequest.prototype, "headers", {
  configurable: true,
  enumerable: inheritedHeaders.enumerable,
  get() {
    const headers = inheritedHeaders!.get!.call(this) as Headers;

    try {
      stampLocality(headers, this.url);
    } catch {
      // NextRequest itself reads headers before its internal URL slot exists.
    }

    return headers;
  },
});
