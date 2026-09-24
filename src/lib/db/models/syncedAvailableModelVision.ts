/**
 * Positive-only synced-available-model vision lookup.
 *
 * Provider model sync stores supportsVision:true on syncedAvailableModels rows.
 * These readers union that signal across all connections without letting an
 * absent/false row downgrade another capability source.
 */
import type { SqliteAdapter } from "../adapters/types";
import { getDbInstance } from "../core";
import { getKeyValue } from "./shared";
import { normalizeSyncedAvailableModels } from "./synced";

export type SyncedAvailableModelVisionMap = ReadonlyMap<string, ReadonlySet<string>>;
export type SyncedAvailableModelVisionDatabase = Pick<SqliteAdapter, "prepare">;

export interface SyncedAvailableModelVisionReadOptions {
  getDatabase?: () => SyncedAvailableModelVisionDatabase;
}

function collectVisionModelIds(providerId: string, rawValue: string | null): string[] {
  if (!rawValue) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return [];
  }
  return normalizeSyncedAvailableModels(parsed, providerId)
    .filter((model) => model.supportsVision === true)
    .map((model) => model.id);
}

export function listSyncedAvailableModelVision(
  options: SyncedAvailableModelVisionReadOptions = {}
): SyncedAvailableModelVisionMap {
  try {
    const db = options.getDatabase?.() ?? getDbInstance();
    const rows = db
      .prepare("SELECT key, value FROM key_value WHERE namespace = 'syncedAvailableModels'")
      .all();
    const result = new Map<string, Set<string>>();
    for (const row of rows) {
      const { key, value } = getKeyValue(row);
      if (!key || !value) continue;
      const providerId = key.split(":")[0];
      if (!providerId) continue;
      const visionIds = collectVisionModelIds(providerId, value);
      if (visionIds.length === 0) continue;
      let byModel = result.get(providerId);
      if (!byModel) {
        byModel = new Set<string>();
        result.set(providerId, byModel);
      }
      for (const id of visionIds) byModel.add(id);
    }
    return result;
  } catch {
    return new Map<string, Set<string>>();
  }
}

export function getSyncedAvailableModelVision(
  providerId: string,
  modelId: string,
  bulk?: SyncedAvailableModelVisionMap | null,
  options: SyncedAvailableModelVisionReadOptions = {}
): boolean | null {
  if (!providerId || !modelId) return null;
  try {
    if (bulk) {
      return bulk.get(providerId)?.has(modelId) === true ? true : null;
    }
    const db = options.getDatabase?.() ?? getDbInstance();
    const rows = db
      .prepare(
        "SELECT value FROM key_value WHERE namespace = 'syncedAvailableModels' AND key LIKE ?"
      )
      .all(`${providerId}:%`);
    for (const row of rows) {
      const { value } = getKeyValue(row);
      if (collectVisionModelIds(providerId, value).includes(modelId)) return true;
    }
    return null;
  } catch {
    return null;
  }
}
