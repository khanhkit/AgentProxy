import bcrypt from "bcryptjs";

const MANAGEMENT_PASSWORD_SALT_ROUNDS = 12;

const SETTINGS_REVISION_KEY = "_settingsRevision";

function readSettingsRevision(db) {
  const row = db
    .prepare("SELECT value FROM key_value WHERE namespace = 'settings' AND key = ?")
    .get(SETTINGS_REVISION_KEY);
  if (!row?.value) return 0;
  try {
    const value = JSON.parse(row.value);
    return Number.isInteger(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export async function hashManagementPassword(password) {
  return bcrypt.hash(password, MANAGEMENT_PASSWORD_SALT_ROUNDS);
}

export function ensureSettingsSchema(db) {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS key_value (
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (namespace, key)
    )`
  ).run();
}

export function updateSettings(db, updates) {
  ensureSettingsSchema(db);
  const insert = db.prepare(
    "INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES ('settings', ?, ?)"
  );
  const select = db.prepare("SELECT value FROM key_value WHERE namespace = 'settings' AND key = ?");
  const tx = db.transaction(() => {
    const currentRevision = readSettingsRevision(db);
    let changed = false;
    for (const [key, value] of Object.entries(updates)) {
      const serialized = JSON.stringify(value);
      if (serialized === undefined)
        throw new TypeError(`Setting ${key} cannot serialize to undefined`);
      if (select.get(key)?.value === serialized) continue;
      insert.run(key, serialized);
      changed = true;
    }
    if (changed) {
      insert.run(SETTINGS_REVISION_KEY, JSON.stringify(currentRevision + 1));
    }
  });
  tx();
}

export function getSettings(db) {
  ensureSettingsSchema(db);
  const rows = db.prepare("SELECT key, value FROM key_value WHERE namespace = 'settings'").all();
  const settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  return settings;
}
