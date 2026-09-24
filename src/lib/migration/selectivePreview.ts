export type MigrationDisposition =
  | "CREATE"
  | "MERGE"
  | "KEEP_TARGET"
  | "REQUIRES_REAUTH"
  | "UNSUPPORTED"
  | "CONFLICT";

export interface MigrationPreviewItem {
  id: string;
  label: string;
  disposition: MigrationDisposition;
}

export interface MigrationPreviewPlan {
  source: {
    family: "9router" | "omniroute";
    format: "json" | "sqlite";
    version?: string;
  };
  inventory: {
    providerConnections: MigrationPreviewItem[];
    providerNodes: MigrationPreviewItem[];
    combos: MigrationPreviewItem[];
    apiKeys: MigrationPreviewItem[];
    settings: MigrationPreviewItem[];
  };
  unsupported: Array<{ category: string; count: number; disposition: "UNSUPPORTED" }>;
}

type JsonRecord = Record<string, unknown>;

const PORTABLE_JSON_KEYS = new Set([
  "_meta",
  "providerConnections",
  "providerNodes",
  "combos",
  "apiKeys",
  "settings",
  "modelAliases",
  "mitmAlias",
  "pricing",
  "customModels",
  "proxyConfig",
]);

const RUNTIME_JSON_KEYS = ["usageHistory", "domainCostHistory", "domainBudgets"] as const;
const REQUIRED_SQLITE_TABLES = [
  "provider_connections",
  "provider_nodes",
  "combos",
  "api_keys",
] as const;
const RUNTIME_SQLITE_TABLES = new Set([
  "usage_history",
  "quota_snapshots",
  "call_logs",
  "detailed_request_logs",
  "provider_quota_reset_events",
]);

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((entry): entry is JsonRecord => asRecord(entry) !== null) : [];
}

function stringField(record: JsonRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function itemFromRecord(
  record: JsonRecord,
  index: number,
  category: string,
  disposition: MigrationDisposition
): MigrationPreviewItem {
  return {
    id: stringField(record, "id", "name") ?? category + "-" + String(index + 1),
    label: stringField(record, "name", "displayName", "provider", "id") ?? category + " " + String(index + 1),
    disposition,
  };
}

function connectionDisposition(record: JsonRecord): MigrationDisposition {
  return stringField(record, "apiKey", "accessToken", "refreshToken", "idToken")
    ? "CREATE"
    : "REQUIRES_REAUTH";
}

export function previewJsonMigrationSource(input: unknown): MigrationPreviewPlan {
  const data = asRecord(input);
  if (!data) throw new Error("Unsupported migration JSON source");

  const meta = asRecord(data._meta);
  const sourceMarker = String(meta?.source ?? meta?.product ?? "").toLowerCase();
  const hasPortableShape = ["providerConnections", "providerNodes", "combos", "apiKeys", "settings"].some(
    (key) => key in data
  );
  if (!hasPortableShape || (sourceMarker && !sourceMarker.includes("9router"))) {
    throw new Error("Unsupported migration JSON source");
  }

  const connections = asRecords(data.providerConnections);
  const nodes = asRecords(data.providerNodes);
  const combos = asRecords(data.combos);
  const apiKeys = asRecords(data.apiKeys);
  const settings = asRecord(data.settings);

  const unsupported: MigrationPreviewPlan["unsupported"] = [];
  for (const key of RUNTIME_JSON_KEYS) {
    const value = data[key];
    const count = Array.isArray(value) ? value.length : value === undefined ? 0 : 1;
    if (count > 0) unsupported.push({ category: key, count, disposition: "UNSUPPORTED" });
  }
  for (const key of Object.keys(data)) {
    if (PORTABLE_JSON_KEYS.has(key) || RUNTIME_JSON_KEYS.includes(key as (typeof RUNTIME_JSON_KEYS)[number])) continue;
    unsupported.push({ category: key, count: 1, disposition: "UNSUPPORTED" });
  }

  return {
    source: {
      family: "9router",
      format: "json",
      ...(typeof meta?.version === "string" ? { version: meta.version } : {}),
    },
    inventory: {
      providerConnections: connections.map((row, i) =>
        itemFromRecord(row, i, "connection", connectionDisposition(row))
      ),
      providerNodes: nodes.map((row, i) => itemFromRecord(row, i, "node", "CREATE")),
      combos: combos.map((row, i) => itemFromRecord(row, i, "combo", "CREATE")),
      apiKeys: apiKeys.map((row, i) => itemFromRecord(row, i, "api-key", "REQUIRES_REAUTH")),
      settings: settings ? [{ id: "settings", label: "Portable settings", disposition: "MERGE" }] : [],
    },
    unsupported,
  };
}

interface SelectOnlyAdapter {
  prepare(sql: string): {
    all?: () => unknown[];
    get?: () => unknown;
  };
}

function countRows(adapter: SelectOnlyAdapter, table: string): number {
  const row = adapter.prepare("SELECT COUNT(*) AS count FROM " + table).get?.() as
    | { count?: unknown }
    | undefined;
  return typeof row?.count === "number" && Number.isFinite(row.count) ? row.count : 0;
}

function countItems(count: number, category: string, disposition: MigrationDisposition): MigrationPreviewItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: category + "-" + String(index + 1),
    label: category + " " + String(index + 1),
    disposition,
  }));
}

export function previewSqliteMigrationSource(adapter: SelectOnlyAdapter): MigrationPreviewPlan {
  const rows = adapter
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all?.() as Array<{ name?: unknown }> | undefined;
  const tables = new Set((rows ?? []).map((row) => String(row.name ?? "")));
  if (!REQUIRED_SQLITE_TABLES.every((table) => tables.has(table))) {
    throw new Error("Unsupported migration SQLite source");
  }

  const counts = {
    providerConnections: countRows(adapter, "provider_connections"),
    providerNodes: countRows(adapter, "provider_nodes"),
    combos: countRows(adapter, "combos"),
    apiKeys: countRows(adapter, "api_keys"),
  };
  const unsupported = [...tables]
    .filter((table) => RUNTIME_SQLITE_TABLES.has(table))
    .sort()
    .map((table) => ({ category: table, count: countRows(adapter, table), disposition: "UNSUPPORTED" as const }));

  return {
    source: { family: "omniroute", format: "sqlite" },
    inventory: {
      providerConnections: countItems(counts.providerConnections, "connection", "REQUIRES_REAUTH"),
      providerNodes: countItems(counts.providerNodes, "node", "CREATE"),
      combos: countItems(counts.combos, "combo", "CREATE"),
      apiKeys: countItems(counts.apiKeys, "api-key", "REQUIRES_REAUTH"),
      settings: [],
    },
    unsupported,
  };
}
