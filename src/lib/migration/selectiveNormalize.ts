import type {
  MigrationEntityRef,
  MigrationSourceEntity,
} from "./selectivePlan.ts";

type JsonRecord = Record<string, unknown>;

const PORTABLE_SETTINGS_KEYS = [
  "comboStrategy",
  "comboStickyRoundRobinLimit",
  "providerStrategies",
  "quotaVisibility",
] as const;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => asRecord(entry) !== null)
    : [];
}

function stringField(record: JsonRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function numberField(record: JsonRecord, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function boolField(record: JsonRecord, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (value === 0) return false;
    if (value === 1) return true;
  }
  return undefined;
}

function parseRecord(value: unknown): JsonRecord {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return asRecord(JSON.parse(value)) ?? {};
  } catch {
    return {};
  }
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function identityPart(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function connectionIdentity(data: JsonRecord, sourceId: string): string {
  const provider = identityPart(data.provider);
  const authType = identityPart(data.authType);
  const email = identityPart(data.email);
  const name = identityPart(data.name);
  return [provider || "unknown", authType || "unknown", email || name || sourceId].join("|");
}

function nodeIdentity(data: JsonRecord, sourceId: string): string {
  return [
    identityPart(data.type) || "unknown",
    identityPart(data.baseUrl) || identityPart(data.name) || sourceId,
  ].join("|");
}

function comboIdentity(name: unknown, sourceId: string): string {
  return "combo|" + (identityPart(name) || sourceId);
}

function apiKeyIdentity(name: unknown, sourceId: string): string {
  return "api-key|" + (identityPart(name) || sourceId);
}

function dependenciesFromModels(models: unknown): MigrationEntityRef[] {
  const refs = new Map<string, MigrationEntityRef>();
  for (const entry of Array.isArray(models) ? models : []) {
    const row = asRecord(entry);
    if (!row) continue;

    const direct = stringField(row, "connectionId");
    if (direct) {
      refs.set("providerConnections:" + direct, {
        category: "providerConnections",
        sourceId: direct,
      });
    }

    const allowed = row.allowedConnectionIds;
    if (Array.isArray(allowed)) {
      for (const candidate of allowed) {
        if (typeof candidate !== "string" || !candidate.trim()) continue;
        refs.set("providerConnections:" + candidate, {
          category: "providerConnections",
          sourceId: candidate,
        });
      }
    }
  }
  return [...refs.values()];
}

function portableSettings(input: unknown): Record<string, unknown> {
  const settings = asRecord(input);
  if (!settings) return {};
  const result: Record<string, unknown> = {};
  for (const key of PORTABLE_SETTINGS_KEYS) {
    if (settings[key] !== undefined) result[key] = settings[key];
  }
  return result;
}

function connectionEntity(
  sourceId: string,
  raw: JsonRecord,
  extras: JsonRecord = {}
): MigrationSourceEntity {
  const data: JsonRecord = {};
  const provider = stringField(raw, "provider");
  const authType = stringField(raw, "authType", "auth_type");
  const name = stringField(raw, "name");
  const email = stringField(raw, "email");
  const priority = numberField(raw, "priority");
  const isActive = boolField(raw, "isActive", "is_active");
  const displayName = stringField(raw, "displayName", "display_name") ??
    stringField(extras, "displayName");
  const defaultModel = stringField(raw, "defaultModel", "default_model") ??
    stringField(extras, "defaultModel");

  if (provider !== undefined) data.provider = provider;
  if (authType !== undefined) data.authType = authType;
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = email;
  if (priority !== undefined) data.priority = priority;
  if (isActive !== undefined) data.isActive = isActive;
  if (displayName !== undefined) data.displayName = displayName;
  if (defaultModel !== undefined) data.defaultModel = defaultModel;

  return {
    category: "providerConnections",
    sourceId,
    identity: connectionIdentity(data, sourceId),
    label: displayName ?? name ?? email ?? provider ?? sourceId,
    disposition: "REQUIRES_REAUTH",
    data,
  };
}

function nodeEntity(sourceId: string, raw: JsonRecord, extras: JsonRecord = {}): MigrationSourceEntity {
  const data: JsonRecord = {};
  const type = stringField(raw, "type");
  const name = stringField(raw, "name");
  const prefix = stringField(raw, "prefix") ?? stringField(extras, "prefix");
  const apiType = stringField(raw, "apiType", "api_type") ?? stringField(extras, "apiType");
  const baseUrl = stringField(raw, "baseUrl", "base_url") ?? stringField(extras, "baseUrl");
  const chatPath = stringField(raw, "chatPath", "chat_path") ?? stringField(extras, "chatPath");
  const modelsPath = stringField(raw, "modelsPath", "models_path") ?? stringField(extras, "modelsPath");
  const rawHeaders = raw.custom_headers_json ?? extras.customHeaders ?? extras.custom_headers_json;
  const customHeaders = asRecord(rawHeaders) ?? parseRecord(rawHeaders);

  if (type !== undefined) data.type = type;
  if (name !== undefined) data.name = name;
  if (prefix !== undefined) data.prefix = prefix;
  if (apiType !== undefined) data.apiType = apiType;
  if (baseUrl !== undefined) data.baseUrl = baseUrl;
  if (chatPath !== undefined) data.chatPath = chatPath;
  if (modelsPath !== undefined) data.modelsPath = modelsPath;
  if (Object.keys(customHeaders).length > 0 || rawHeaders === "{}") data.customHeaders = customHeaders;

  return {
    category: "providerNodes",
    sourceId,
    identity: nodeIdentity(data, sourceId),
    label: name ?? baseUrl ?? sourceId,
    disposition: "CREATE",
    data,
  };
}

function comboEntity(sourceId: string, raw: JsonRecord, models: unknown): MigrationSourceEntity {
  const name = stringField(raw, "name") ?? sourceId;
  const kind = stringField(raw, "kind");
  const normalizedModels = Array.isArray(models) ? models : [];
  const data: JsonRecord = { name, models: normalizedModels };
  if (kind !== undefined) data.kind = kind;

  return {
    category: "combos",
    sourceId,
    identity: comboIdentity(name, sourceId),
    label: name,
    disposition: "CREATE",
    dependencies: dependenciesFromModels(normalizedModels),
    data,
  };
}

function apiKeyEntity(sourceId: string, raw: JsonRecord, extras: JsonRecord = {}): MigrationSourceEntity {
  const name = stringField(raw, "name") ?? sourceId;
  const allowedModels = parseArray(raw.allowed_models ?? raw.allowedModels ?? extras.allowedModels);
  const noLog = boolField(raw, "no_log", "noLog");
  const data: JsonRecord = { name };
  if (allowedModels.length > 0) data.allowedModels = allowedModels.filter((item): item is string => typeof item === "string");
  if (noLog !== undefined) data.noLog = noLog;

  return {
    category: "apiKeys",
    sourceId,
    identity: apiKeyIdentity(name, sourceId),
    label: name,
    disposition: "REQUIRES_REAUTH",
    data,
  };
}

function settingsEntity(input: unknown): MigrationSourceEntity | null {
  const data = portableSettings(input);
  if (Object.keys(data).length === 0) return null;
  return {
    category: "settings",
    sourceId: "settings",
    identity: "settings",
    label: "Portable settings",
    disposition: "MERGE",
    data,
  };
}

export function normalize9RouterJsonSource(input: unknown): MigrationSourceEntity[] {
  const root = asRecord(input);
  if (!root) throw new Error("Unsupported 9Router JSON source");

  const entities: MigrationSourceEntity[] = [];

  for (const row of asRecords(root.providerConnections)) {
    const id = stringField(row, "id");
    if (!id) continue;
    entities.push(connectionEntity(id, row));
  }

  for (const row of asRecords(root.providerNodes)) {
    const id = stringField(row, "id");
    if (!id) continue;
    entities.push(nodeEntity(id, row));
  }

  for (const row of asRecords(root.combos)) {
    const id = stringField(row, "id");
    if (!id) continue;
    entities.push(comboEntity(id, row, row.models));
  }

  for (const row of asRecords(root.apiKeys)) {
    const id = stringField(row, "id");
    if (!id) continue;
    entities.push(apiKeyEntity(id, row));
  }

  const settings = settingsEntity(root.settings);
  if (settings) entities.push(settings);

  return entities;
}

interface FixtureRows {
  providerConnections?: unknown;
  providerNodes?: unknown;
  combos?: unknown;
  apiKeys?: unknown;
  settings?: unknown;
}

export function normalize9RouterSqliteRows(input: unknown): MigrationSourceEntity[] {
  const root = asRecord(input) as FixtureRows | null;
  if (!root) throw new Error("Unsupported 9Router SQLite rows");

  const entities: MigrationSourceEntity[] = [];

  for (const row of asRecords(root.providerConnections)) {
    const id = stringField(row, "id");
    if (!id) continue;
    entities.push(connectionEntity(id, row, parseRecord(row.data)));
  }

  for (const row of asRecords(root.providerNodes)) {
    const id = stringField(row, "id");
    if (!id) continue;
    entities.push(nodeEntity(id, row, parseRecord(row.data)));
  }

  for (const row of asRecords(root.combos)) {
    const id = stringField(row, "id");
    if (!id) continue;
    entities.push(comboEntity(id, row, parseArray(row.models)));
  }

  for (const row of asRecords(root.apiKeys)) {
    const id = stringField(row, "id");
    if (!id) continue;
    entities.push(apiKeyEntity(id, row));
  }

  const settingsRow = asRecords(root.settings)[0];
  const settings = settingsEntity(settingsRow ? parseRecord(settingsRow.data) : null);
  if (settings) entities.push(settings);

  return entities;
}

export function normalizeOmniRouteSqliteRows(input: unknown): MigrationSourceEntity[] {
  const root = asRecord(input) as FixtureRows | null;
  if (!root) throw new Error("Unsupported OmniRoute SQLite rows");

  const entities: MigrationSourceEntity[] = [];

  for (const row of asRecords(root.providerConnections)) {
    const id = stringField(row, "id");
    if (!id) continue;
    entities.push(connectionEntity(id, row));
  }

  for (const row of asRecords(root.providerNodes)) {
    const id = stringField(row, "id");
    if (!id) continue;
    entities.push(nodeEntity(id, row));
  }

  for (const row of asRecords(root.combos)) {
    const id = stringField(row, "id");
    if (!id) continue;
    const comboData = parseRecord(row.data);
    entities.push(comboEntity(id, { ...row, ...comboData }, comboData.models));
  }

  for (const row of asRecords(root.apiKeys)) {
    const id = stringField(row, "id");
    if (!id) continue;
    entities.push(apiKeyEntity(id, row));
  }

  return entities;
}


interface SelectRowsAdapter {
  prepare(sql: string): {
    all?: () => unknown[];
  };
}

function rows(adapter: SelectRowsAdapter, sql: string): unknown[] {
  return adapter.prepare(sql).all?.() ?? [];
}

export function readSqliteMigrationEntities(
  adapter: SelectRowsAdapter,
  family: "9router" | "omniroute"
): MigrationSourceEntity[] {
  if (family === "9router") {
    return normalize9RouterSqliteRows({
      providerConnections: rows(
        adapter,
        "SELECT id, provider, authType, name, email, priority, isActive, data FROM providerConnections"
      ),
      providerNodes: rows(
        adapter,
        "SELECT id, type, name, data FROM providerNodes"
      ),
      combos: rows(
        adapter,
        "SELECT id, name, kind, models FROM combos"
      ),
      apiKeys: rows(
        adapter,
        "SELECT id, name FROM apiKeys"
      ),
      settings: rows(
        adapter,
        "SELECT id, data FROM settings WHERE id = 1"
      ),
    });
  }

  return normalizeOmniRouteSqliteRows({
    providerConnections: rows(
      adapter,
      "SELECT id, provider, auth_type, name, email, priority, is_active, display_name, default_model FROM provider_connections"
    ),
    providerNodes: rows(
      adapter,
      "SELECT id, type, name, prefix, api_type, base_url, chat_path, models_path, custom_headers_json FROM provider_nodes"
    ),
    combos: rows(
      adapter,
      "SELECT id, name, data FROM combos"
    ),
    apiKeys: rows(
      adapter,
      "SELECT id, name, allowed_models, no_log FROM api_keys"
    ),
  });
}
