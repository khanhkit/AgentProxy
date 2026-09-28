export const LEGACY_OAUTH_CALLBACK_STORAGE_KEY = "oauth_callback";

/**
 * Return the per-flow BroadcastChannel name for an OAuth callback state nonce.
 * Missing/blank state intentionally disables broadcast delivery so callback
 * credentials never fall back to a generic same-origin secret-bearing channel.
 */
export function getOAuthCallbackChannelName(state: unknown): string | null {
  if (typeof state !== "string") return null;
  const normalized = state.trim();
  return normalized ? `oauth_callback:${normalized}` : null;
}
