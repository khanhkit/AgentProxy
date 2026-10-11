import { getDbInstance } from "./core";

export const SETTINGS_REVISION_KEY = "_settingsRevision";

type SettingsDb = ReturnType<typeof getDbInstance>;

export function readSettingsRevisionFromDb(db: SettingsDb): number {
  const row = db
    .prepare("SELECT value FROM key_value WHERE namespace = 'settings' AND key = ?")
    .get(SETTINGS_REVISION_KEY) as { value?: string } | undefined;
  if (!row?.value) return 0;
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function advanceSettingsRevision(db: SettingsDb, currentRevision?: number): number {
  const nextRevision = (currentRevision ?? readSettingsRevisionFromDb(db)) + 1;
  db.prepare(
    "INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('settings', ?, ?)"
  ).run(SETTINGS_REVISION_KEY, JSON.stringify(nextRevision));
  return nextRevision;
}
