import { classifyIpScope, type IpScope } from "@/lib/ipUtils";
import { AUTHZ_HEADER_TRUSTED_PEER_IP } from "@/server/authz/headers";
import { classifyHostLocality } from "@/server/authz/routeGuard";
import { getRequestPeerLocality } from "@/shared/utils/apiAuth";

const UNKNOWN_PEER_KEY = "__unknown_peer__";

export function getLoginLockoutKey(request: Request, forwardedIp: string | null): string | null {
  if (!process.env.AGENTPROXY_PEER_STAMP_TOKEN) return forwardedIp;
  return request.headers.get(AUTHZ_HEADER_TRUSTED_PEER_IP) || UNKNOWN_PEER_KEY;
}

export function getLoginSourceScope(request: Request, forwardedIp: string | null): IpScope {
  if (!process.env.AGENTPROXY_PEER_STAMP_TOKEN) return classifyIpScope(forwardedIp);
  const locality = getRequestPeerLocality(request);
  return locality === "loopback" ? "loopback" : locality === "lan" ? "private" : "public";
}

export function isHostOperatorRequest(request: Request): boolean {
  if (getRequestPeerLocality(request) !== "loopback") return false;
  let host = request.headers.get("host");
  if (!host) {
    try {
      host = new URL(request.url).host;
    } catch {
      return false;
    }
  }
  return classifyHostLocality(host) === "loopback";
}
