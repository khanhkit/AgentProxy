import { randomBytes } from "node:crypto";
import { PEER_IP_HEADER, VIA_PROXY_HEADER } from "@/server/authz/headers";
import { classifyStampedPeerLocality } from "@/server/authz/peerStamp";

const TRAE_CALLBACK_STATE_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_TRAE_CALLBACK_STATES = 64;

type TraeCallbackStateStore = Map<string, number>;
type GlobalWithTraeCallbackState = typeof globalThis & {
  __traeCallbackStates?: TraeCallbackStateStore;
};

function getStore(): TraeCallbackStateStore {
  const root = globalThis as GlobalWithTraeCallbackState;
  root.__traeCallbackStates ??= new Map<string, number>();
  return root.__traeCallbackStates;
}

function pruneStore(now: number): void {
  const store = getStore();
  for (const [state, expiresAt] of store) {
    if (expiresAt <= now) store.delete(state);
  }
  while (store.size >= MAX_PENDING_TRAE_CALLBACK_STATES) {
    const oldest = store.keys().next().value as string | undefined;
    if (!oldest) break;
    store.delete(oldest);
  }
}

export function mintTraeCallbackState(now: number = Date.now()): {
  state: string;
  expiresAt: number;
} {
  pruneStore(now);
  const state = randomBytes(32).toString("base64url");
  const expiresAt = now + TRAE_CALLBACK_STATE_TTL_MS;
  getStore().set(state, expiresAt);
  return { state, expiresAt };
}

export function consumeTraeCallbackState(
  state: string | null | undefined,
  now: number = Date.now()
): boolean {
  if (!state) return false;
  const store = getStore();
  const expiresAt = store.get(state);
  if (expiresAt === undefined) return false;
  store.delete(state);
  return expiresAt > now;
}

export function isTrustedTraeCallbackPeer(request: Request): boolean {
  return (
    classifyStampedPeerLocality(
      request.headers.get(PEER_IP_HEADER),
      request.headers.get(VIA_PROXY_HEADER),
      process.env.AGENTPROXY_PEER_STAMP_TOKEN
    ) === "loopback"
  );
}
