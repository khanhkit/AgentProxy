import type {
  MigrationPlanItem,
  SelectiveMigrationPlan,
} from "./selectivePlan.ts";

export interface SelectiveMigrationRestorePoint {
  id: string;
}

export interface SelectiveMigrationApplyDeps {
  createRestorePoint(): Promise<SelectiveMigrationRestorePoint>;
  restoreRestorePoint(id: string): Promise<void>;
  createProviderConnection(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  createProviderNode(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  createCombo(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  updateSettings(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  setModelAlias?(alias: string, model: unknown): Promise<unknown>;
  updatePricing?(pricing: Record<string, unknown>): Promise<unknown>;
}

export interface SelectiveMigrationApplyItemResult {
  category: MigrationPlanItem["category"];
  sourceId: string;
  status: "CREATED" | "MERGED" | "KEEP_TARGET" | "REQUIRES_REAUTH";
  targetId: string | null;
}

export interface SelectiveMigrationApplyResult {
  restorePointId: string | null;
  idMap: Record<string, string | null>;
  items: SelectiveMigrationApplyItemResult[];
}

export class SelectiveMigrationApplyError extends Error {
  readonly restorePointId: string | null;
  readonly rolledBack: boolean;
  readonly cause: unknown;

  constructor(
    message: string,
    options: {
      restorePointId: string | null;
      rolledBack: boolean;
      cause: unknown;
    }
  ) {
    super(message);
    this.name = "SelectiveMigrationApplyError";
    this.restorePointId = options.restorePointId;
    this.rolledBack = options.rolledBack;
    this.cause = options.cause;
  }
}

const CATEGORY_ORDER: Record<MigrationPlanItem["category"], number> = {
  providerConnections: 10,
  providerNodes: 20,
  settings: 30,
  modelAliases: 40,
  customModels: 50,
  pricing: 60,
  proxyConfig: 70,
  combos: 80,
  apiKeys: 90,
};

function sourceKey(item: Pick<MigrationPlanItem, "category" | "sourceId">): string {
  return item.category + ":" + item.sourceId;
}

function targetIdFrom(value: Record<string, unknown>, label: string): string {
  if (typeof value.id === "string" && value.id.trim()) return value.id;
  throw new Error(label + " writer did not return a target id");
}

function requiresMutation(item: MigrationPlanItem): boolean {
  if (item.disposition === "KEEP_TARGET") return false;
  if (item.category === "apiKeys" && item.disposition === "REQUIRES_REAUTH") return false;
  return (
    item.disposition === "CREATE" ||
    item.disposition === "MERGE" ||
    (item.category === "providerConnections" && item.disposition === "REQUIRES_REAUTH")
  );
}

function ensureApplicable(plan: SelectiveMigrationPlan): void {
  if (!plan.canApply) throw new Error("Selective migration plan is not applicable");
  for (const item of plan.items) {
    if (
      item.disposition === "CONFLICT" ||
      item.disposition === "UNSUPPORTED" ||
      item.unresolvedDependencies.length > 0
    ) {
      throw new Error("Selective migration plan is not applicable");
    }
  }
}

function mappedConnectionId(
  sourceId: string,
  idMap: Record<string, string | null>
): string {
  const targetId = idMap["providerConnections:" + sourceId];
  if (!targetId) {
    throw new Error("Missing target connection mapping for " + sourceId);
  }
  return targetId;
}

function remapComboData(
  data: Record<string, unknown>,
  idMap: Record<string, string | null>
): Record<string, unknown> {
  const models = data.models;
  if (!Array.isArray(models)) return { ...data };

  return {
    ...data,
    models: models.map((entry) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        return entry;
      }
      const row = { ...(entry as Record<string, unknown>) };

      if (typeof row.connectionId === "string" && row.connectionId.trim()) {
        row.connectionId = mappedConnectionId(row.connectionId, idMap);
      }

      if (Array.isArray(row.allowedConnectionIds)) {
        row.allowedConnectionIds = row.allowedConnectionIds.map((id) =>
          typeof id === "string" && id.trim() ? mappedConnectionId(id, idMap) : id
        );
      }

      return row;
    }),
  };
}

async function applyItem(
  item: MigrationPlanItem,
  idMap: Record<string, string | null>,
  deps: SelectiveMigrationApplyDeps
): Promise<SelectiveMigrationApplyItemResult> {
  const key = sourceKey(item);

  if (item.disposition === "KEEP_TARGET") {
    const targetId = item.targetId ?? idMap[key] ?? null;
    return {
      category: item.category,
      sourceId: item.sourceId,
      status: "KEEP_TARGET",
      targetId,
    };
  }

  if (item.category === "apiKeys" && item.disposition === "REQUIRES_REAUTH") {
    return {
      category: item.category,
      sourceId: item.sourceId,
      status: "REQUIRES_REAUTH",
      targetId: null,
    };
  }

  const data = item.data ?? {};

  if (item.category === "providerConnections") {
    const payload =
      item.disposition === "REQUIRES_REAUTH"
        ? { ...data, isActive: false }
        : { ...data };
    const created = await deps.createProviderConnection(payload);
    const targetId = targetIdFrom(created, "provider connection");
    idMap[key] = targetId;
    return {
      category: item.category,
      sourceId: item.sourceId,
      status: item.disposition === "REQUIRES_REAUTH" ? "REQUIRES_REAUTH" : "CREATED",
      targetId,
    };
  }

  if (item.category === "providerNodes") {
    const created = await deps.createProviderNode({ ...data });
    const targetId = targetIdFrom(created, "provider node");
    idMap[key] = targetId;
    return {
      category: item.category,
      sourceId: item.sourceId,
      status: "CREATED",
      targetId,
    };
  }

  if (item.category === "settings") {
    await deps.updateSettings({ ...data });
    idMap[key] = "settings";
    return {
      category: item.category,
      sourceId: item.sourceId,
      status: "MERGED",
      targetId: "settings",
    };
  }

  if (item.category === "modelAliases") {
    const alias = typeof data.alias === "string" ? data.alias.trim() : "";
    if (!alias || typeof data.model !== "string" || !data.model.trim() || !deps.setModelAlias) {
      throw new Error("Model alias migration writer is unavailable");
    }
    await deps.setModelAlias(alias, data.model.trim());
    const targetId = "modelAlias:" + alias;
    idMap[key] = targetId;
    return {
      category: item.category,
      sourceId: item.sourceId,
      status: "CREATED",
      targetId,
    };
  }

  if (item.category === "pricing") {
    const provider = typeof data.provider === "string" ? data.provider.trim() : "";
    const model = typeof data.model === "string" ? data.model.trim() : "";
    const pricing =
      data.pricing !== null && typeof data.pricing === "object" && !Array.isArray(data.pricing)
        ? (data.pricing as Record<string, unknown>)
        : null;
    if (!provider || !model || !pricing || !deps.updatePricing) {
      throw new Error("Pricing migration writer is unavailable");
    }
    await deps.updatePricing({ [provider]: { [model]: pricing } });
    const targetId = "pricing:" + provider + ":" + model;
    idMap[key] = targetId;
    return {
      category: item.category,
      sourceId: item.sourceId,
      status: "CREATED",
      targetId,
    };
  }

  if (item.category === "combos") {
    const created = await deps.createCombo(remapComboData(data, idMap));
    const targetId = targetIdFrom(created, "combo");
    idMap[key] = targetId;
    return {
      category: item.category,
      sourceId: item.sourceId,
      status: "CREATED",
      targetId,
    };
  }

  throw new Error("Apply writer not implemented for category " + item.category);
}

export async function applySelectiveMigrationPlan(
  plan: SelectiveMigrationPlan,
  deps: SelectiveMigrationApplyDeps
): Promise<SelectiveMigrationApplyResult> {
  ensureApplicable(plan);

  const orderedItems = [...plan.items].sort(
    (a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
  );
  const idMap = { ...plan.idMap };
  const items: SelectiveMigrationApplyItemResult[] = [];
  const needsRestorePoint = orderedItems.some(requiresMutation);

  if (!needsRestorePoint) {
    for (const item of orderedItems) {
      items.push(await applyItem(item, idMap, deps));
    }
    return { restorePointId: null, idMap, items };
  }

  const restorePoint = await deps.createRestorePoint();
  if (!restorePoint?.id) {
    throw new Error("Selective migration restore point was not created");
  }

  try {
    for (const item of orderedItems) {
      items.push(await applyItem(item, idMap, deps));
    }
    return {
      restorePointId: restorePoint.id,
      idMap,
      items,
    };
  } catch (cause) {
    let rolledBack = false;
    let rollbackError: unknown = null;
    try {
      await deps.restoreRestorePoint(restorePoint.id);
      rolledBack = true;
    } catch (error) {
      rollbackError = error;
    }

    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    const rollbackMessage =
      rollbackError === null
        ? ""
        : "; rollback failed: " +
          (rollbackError instanceof Error ? rollbackError.message : String(rollbackError));

    throw new SelectiveMigrationApplyError(
      "Selective migration apply failed: " + causeMessage + rollbackMessage,
      {
        restorePointId: restorePoint.id,
        rolledBack,
        cause,
      }
    );
  }
}
