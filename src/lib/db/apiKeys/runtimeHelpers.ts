import type { JsonRecord } from "./internalTypes";

export function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

export function isConfiguredEnvApiKey(key: string): boolean {
  const envKey =
    process.env.AGENTPROXY_API_KEY || process.env.ROUTER_API_KEY;
  return Boolean(envKey && key === envKey);
}

export function isRedisAuthCacheEnabled(): boolean {
  return (
    process.env.AGENTPROXY_DISABLE_REDIS_AUTH_CACHE !== "1" &&
    process.env.NODE_ENV !== "test" &&
    process.env.DISABLE_SQLITE_AUTO_BACKUP !== "true"
  );
}
