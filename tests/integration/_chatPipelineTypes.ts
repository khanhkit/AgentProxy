export type SeedConnectionOverrides = {
  name?: string;
  authType?: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: string;
  tokenExpiresAt?: string;
  isActive?: boolean;
  testStatus?: string;
  priority?: number;
  rateLimitedUntil?: string | number | null;
  providerSpecificData?: Record<string, unknown>;
};

export type FetchCall = {
  url: string;
  method?: string;
  headers: Record<string, string>;
  // Dynamic provider payloads are asserted structurally throughout the integration suite.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any> | null;
};

export type SeedApiKeyOptions = {
  name?: string;
  noLog?: boolean;
  allowedConnections?: string[];
  allowedCombos?: string[];
  allowedModels?: string[];
};

export function toPlainHeaders(headers: HeadersInit | undefined | null) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, value == null ? "" : String(value)])
  );
}
