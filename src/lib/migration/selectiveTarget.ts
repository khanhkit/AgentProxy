import type { MigrationTargetEntity } from "./selectivePlan.ts";

type JsonRecord = Record<string, unknown>;

interface TargetSnapshot {
  providerConnections?: unknown;
  providerNodes?: unknown;
  combos?: unknown;
}

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

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identityPart(value: unknown): string {
  return text(value).toLowerCase();
}

export function normalizeTargetEntities(input: TargetSnapshot): MigrationTargetEntity[] {
  const result: MigrationTargetEntity[] = [];

  for (const row of asRecords(input.providerConnections)) {
    const targetId = text(row.id);
    const provider = identityPart(row.provider);
    const authType = identityPart(row.authType ?? row.auth_type);
    const email = identityPart(row.email);
    const name = identityPart(row.name);
    if (!targetId || !provider) continue;

    result.push({
      category: "providerConnections",
      targetId,
      identity: [provider, authType || "unknown", email || name || targetId].join("|"),
    });
  }

  for (const row of asRecords(input.providerNodes)) {
    const targetId = text(row.id);
    const type = identityPart(row.type);
    const baseUrl = identityPart(row.baseUrl ?? row.base_url);
    const name = identityPart(row.name);
    if (!targetId || !type || (!baseUrl && !name)) continue;

    result.push({
      category: "providerNodes",
      targetId,
      identity: [type, baseUrl || name || targetId].join("|"),
    });
  }

  for (const row of asRecords(input.combos)) {
    const targetId = text(row.id);
    const name = identityPart(row.name);
    if (!targetId || !name) continue;

    result.push({
      category: "combos",
      targetId,
      identity: "combo|" + name,
    });
  }

  return result;
}
