/**
 * db/featureFlags.ts — Feature flag DB overrides.
 *
 * Stores per-flag override values in the key_value table under the
 * "feature_flags" namespace. When an override is present it takes precedence
 * over the process environment variable of the same name.
 */

import { FEATURE_FLAG_DEFINITIONS } from "@/shared/constants/featureFlagDefinitions";
import { getDbInstance } from "./core";
import { advanceSettingsRevision, readSettingsRevisionFromDb } from "./settingsRevision";
import { finishModelCatalogWriteWithoutBackup } from "./models/modelCatalogWriteSignals";

const NAMESPACE = "feature_flags";

// Flag reads sit on hot paths that call them once per string leaf of a request
// body (sanitizePII, the PII masker guardrail), so a synchronous SELECT per
// read turned a 2 MB agentic request into a thousand SQLite round trips. The
// cache is invalidated by every writer in this module; the short TTL only
// covers edits made to the store from outside this process. It is keyed by the
// database instance so a reopened store (tests, resetDbInstance) starts clean.
const OVERRIDE_CACHE_TTL_MS = 1000;
type OverrideCacheEntry = { value: string | undefined; expiresAt: number; revision: number };
const overrideCaches = new WeakMap<object, Map<string, OverrideCacheEntry>>();

function overrideCacheFor(db: object): Map<string, OverrideCacheEntry> {
  let cache = overrideCaches.get(db);
  if (!cache) {
    cache = new Map();
    overrideCaches.set(db, cache);
  }
  return cache;
}

export function clearFeatureFlagOverrideCache(key?: string): void {
  const cache = overrideCaches.get(getDbInstance());
  if (!cache) return;
  if (key === undefined) cache.clear();
  else cache.delete(key);
}

const CATALOG_RELEVANT_FEATURE_FLAGS = new Set([
  "MODEL_CATALOG_INCLUDE_NAMES",
  "MODELS_CATALOG_PREFIX_MODE",
  "EXPOSE_CC_DISCOVERY_ALIASES",
  "NO_THINKING_ALIAS_ENABLED",
  "AGENTPROXY_DISABLE_THINKING_LEVEL_VARIANTS",
]);

/**
 * Returns all feature flag overrides as a key→value map.
 */
export function getFeatureFlagOverrides(): Record<string, string> {
  const db = getDbInstance();
  const rows = db
    .prepare("SELECT key, value FROM key_value WHERE namespace = ?")
    .all(NAMESPACE) as Array<{ key: string; value: string }>;

  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

/**
 * Returns the override value for a single flag, or undefined if no override
 * is stored.
 */
export function getFeatureFlagOverride(key: string): string | undefined {
  const db = getDbInstance();
  const cache = overrideCacheFor(db);
  const now = Date.now();
  const revision = readSettingsRevisionFromDb(db);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now && cached.revision === revision) return cached.value;
  const row = db
    .prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?")
    .get(NAMESPACE, key) as { value: string } | undefined;
  cache.set(key, { value: row?.value, expiresAt: now + OVERRIDE_CACHE_TTL_MS, revision });
  return row?.value;
}

/**
 * Persists (or replaces) an override for a single flag.
 */
export function setFeatureFlagOverride(key: string, value: string): void {
  const definition = FEATURE_FLAG_DEFINITIONS.find((d) => d.key === key);
  if (!definition) {
    throw new Error(`Unknown feature flag key: ${key}`);
  }
  if (
    definition.type === "enum" &&
    definition.enumValues &&
    !definition.enumValues.includes(value)
  ) {
    throw new Error(
      `Invalid value "${value}" for enum flag ${key}. Allowed: ${definition.enumValues.join(", ")}`
    );
  }
  const db = getDbInstance();
  const write = db.transaction(() => {
    const current = db
      .prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?")
      .get(NAMESPACE, key) as { value: string } | undefined;
    if (current?.value === value) return false;

    const currentRevision = readSettingsRevisionFromDb(db);
    db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES (?, ?, ?)").run(
      NAMESPACE,
      key,
      value
    );
    advanceSettingsRevision(db, currentRevision);
    return true;
  });
  const changed = write();
  if (!changed) return;
  clearFeatureFlagOverrideCache(key);
  if (CATALOG_RELEVANT_FEATURE_FLAGS.has(key)) {
    finishModelCatalogWriteWithoutBackup();
  }
}

/**
 * Removes the override for a single flag, restoring env-var / default
 * behaviour.
 */
export function removeFeatureFlagOverride(key: string): void {
  const db = getDbInstance();
  const write = db.transaction(() => {
    const exists = db
      .prepare("SELECT 1 FROM key_value WHERE namespace = ? AND key = ?")
      .get(NAMESPACE, key);
    if (!exists) return false;

    const currentRevision = readSettingsRevisionFromDb(db);
    db.prepare("DELETE FROM key_value WHERE namespace = ? AND key = ?").run(NAMESPACE, key);
    advanceSettingsRevision(db, currentRevision);
    return true;
  });
  const changed = write();
  if (!changed) return;
  clearFeatureFlagOverrideCache(key);
  if (CATALOG_RELEVANT_FEATURE_FLAGS.has(key)) {
    finishModelCatalogWriteWithoutBackup();
  }
}

/**
 * Removes all stored feature flag overrides.
 */
export function clearAllFeatureFlagOverrides(): void {
  const db = getDbInstance();
  // Placeholders are derived from the set size — a hardcoded `IN (?, ?, ?)` breaks
  // (parameter-count mismatch) the moment a flag is added to the set above.
  const catalogFlags = Array.from(CATALOG_RELEVANT_FEATURE_FLAGS);
  const placeholders = catalogFlags.map(() => "?").join(", ");
  const write = db.transaction(() => {
    const anyOverride = db
      .prepare("SELECT 1 FROM key_value WHERE namespace = ? LIMIT 1")
      .get(NAMESPACE);
    if (!anyOverride) return { changed: false, hadRelevantOverride: false };

    const currentRevision = readSettingsRevisionFromDb(db);
    const hadRelevantOverride = Boolean(
      db
        .prepare(`SELECT 1 FROM key_value WHERE namespace = ? AND key IN (${placeholders}) LIMIT 1`)
        .get(NAMESPACE, ...catalogFlags)
    );
    db.prepare("DELETE FROM key_value WHERE namespace = ?").run(NAMESPACE);
    advanceSettingsRevision(db, currentRevision);
    return { changed: true, hadRelevantOverride };
  });
  const { changed, hadRelevantOverride } = write();
  if (!changed) return;
  clearFeatureFlagOverrideCache();
  if (hadRelevantOverride) {
    finishModelCatalogWriteWithoutBackup();
  }
}
