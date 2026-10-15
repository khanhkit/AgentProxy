import { getDbInstance } from "./core";

export const SETTINGS_REVISION_KEY = "_settingsRevision";

type SettingsDb = ReturnType<typeof getDbInstance>;

let inProcessSettingsRevisionGeneration = 0;

export function getSettingsRevisionGeneration(): number {
  return inProcessSettingsRevisionGeneration;
}

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
  inProcessSettingsRevisionGeneration++;
  return nextRevision;
}

export interface SettingsValueWriteResult {
  changed: boolean;
  revision: number;
}

/**
 * Persist one operator setting together with the shared revision. When the caller
 * already owns a SQLite transaction, reuse it; otherwise create a transaction so
 * the value and revision cannot diverge. Identical serialized values are a no-op.
 */
export function writeSettingsValueWithRevision(
  db: SettingsDb,
  key: string,
  value: unknown
): SettingsValueWriteResult {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError(`Setting ${key} cannot serialize to undefined`);
  }

  const mutate = (): SettingsValueWriteResult => {
    const currentRevision = readSettingsRevisionFromDb(db);
    const row = db
      .prepare("SELECT value FROM key_value WHERE namespace = 'settings' AND key = ?")
      .get(key) as { value?: string } | undefined;
    if (row?.value === serialized) {
      return { changed: false, revision: currentRevision };
    }

    db.prepare(
      "INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('settings', ?, ?)"
    ).run(key, serialized);
    return { changed: true, revision: advanceSettingsRevision(db, currentRevision) };
  };

  return db.inTransaction ? mutate() : db.transaction(mutate)();
}
