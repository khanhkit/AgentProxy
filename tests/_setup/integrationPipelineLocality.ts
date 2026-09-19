// Test-only simulation of the trusted auth pipeline locality stamp.
//
// Integration tests call App Router handlers directly with WHATWG Request objects.
// Those requests have no socket peer, while production requests pass through the
// authz pipeline which strips client-supplied trusted headers and then stamps the
// verified peer locality. Since the hardened auth guard intentionally stopped
// trusting URL Host alone, direct localhost fixtures must model that pipeline step.
//
// Never infer locality when a test supplies forwarding evidence or an explicit
// locality verdict; those cases are intentionally left untouched so remote/proxy
// security tests cannot be promoted to loopback by this harness.
const NativeRequest = globalThis.Request;
const LOCALITY_HEADER = "x-agentproxy-peer-locality";
const FORWARDING_HEADERS = ["forwarded", "x-forwarded-for", "x-real-ip", "cf-connecting-ip"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

class IntegrationPipelineRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init);

    if (this.headers.has(LOCALITY_HEADER)) return;
    if (FORWARDING_HEADERS.some((name) => Boolean(this.headers.get(name)?.trim()))) return;

    try {
      const hostname = new URL(this.url).hostname.toLowerCase();
      if (LOOPBACK_HOSTS.has(hostname)) {
        this.headers.set(LOCALITY_HEADER, "loopback");
      }
    } catch {
      // Keep malformed/opaque request URLs untouched; auth remains fail-closed.
    }
  }
}

globalThis.Request = IntegrationPipelineRequest;
