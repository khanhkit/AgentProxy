import type { MigrationDisposition } from "./selectivePreview.ts";

export type MigrationEntityCategory =
  | "providerConnections"
  | "providerNodes"
  | "combos"
  | "apiKeys"
  | "settings"
  | "modelAliases"
  | "customModels"
  | "pricing"
  | "proxyConfig";

export interface MigrationEntityRef {
  category: MigrationEntityCategory;
  sourceId: string;
}

export interface MigrationSourceEntity extends MigrationEntityRef {
  identity: string;
  label: string;
  disposition: MigrationDisposition;
  dependencies?: MigrationEntityRef[];
  data?: Record<string, unknown>;
}

export interface MigrationTargetEntity {
  category: MigrationEntityCategory;
  targetId: string;
  identity: string;
}

export interface MigrationPlanItem extends MigrationSourceEntity {
  targetId?: string;
  unresolvedDependencies: MigrationEntityRef[];
}

export interface SelectiveMigrationPlan {
  items: MigrationPlanItem[];
  idMap: Record<string, string | null>;
  canApply: boolean;
}

function refKey(ref: MigrationEntityRef): string {
  return ref.category + ":" + ref.sourceId;
}

function targetKey(entity: Pick<MigrationTargetEntity, "category" | "identity">): string {
  return entity.category + ":" + entity.identity;
}

export function buildSelectiveMigrationPlan(input: {
  entities: MigrationSourceEntity[];
  selected: MigrationEntityRef[];
  target: MigrationTargetEntity[];
}): SelectiveMigrationPlan {
  const sourceByRef = new Map(input.entities.map((entity) => [refKey(entity), entity]));
  const selectedKeys = new Set(input.selected.map(refKey));
  const targetByIdentity = new Map(
    input.target.map((entity) => [targetKey(entity), entity])
  );

  const idMap: Record<string, string | null> = {};

  for (const entity of input.entities) {
    const targetMatch = targetByIdentity.get(targetKey(entity));
    if (targetMatch) {
      idMap[refKey(entity)] = targetMatch.targetId;
    } else if (selectedKeys.has(refKey(entity))) {
      idMap[refKey(entity)] = null;
    }
  }

  const items: MigrationPlanItem[] = [];

  for (const selectedRef of input.selected) {
    const entity = sourceByRef.get(refKey(selectedRef));
    if (!entity) {
      items.push({
        ...selectedRef,
        identity: refKey(selectedRef),
        label: refKey(selectedRef),
        disposition: "UNSUPPORTED",
        unresolvedDependencies: [],
      });
      continue;
    }

    const targetMatch = targetByIdentity.get(targetKey(entity));
    const unresolvedDependencies: MigrationEntityRef[] = [];

    for (const dependency of entity.dependencies ?? []) {
      const dependencyEntity = sourceByRef.get(refKey(dependency));
      const dependencyTarget = dependencyEntity
        ? targetByIdentity.get(targetKey(dependencyEntity))
        : undefined;

      if (dependencyTarget) {
        idMap[refKey(dependency)] = dependencyTarget.targetId;
        continue;
      }

      if (selectedKeys.has(refKey(dependency))) {
        if (!(refKey(dependency) in idMap)) {
          idMap[refKey(dependency)] = null;
        }
        continue;
      }

      unresolvedDependencies.push(dependency);
    }

    let disposition = entity.disposition;
    let targetId: string | undefined;

    if (entity.disposition === "UNSUPPORTED") {
      disposition = "UNSUPPORTED";
    } else if (targetMatch) {
      disposition = "KEEP_TARGET";
      targetId = targetMatch.targetId;
      idMap[refKey(entity)] = targetMatch.targetId;
    } else if (unresolvedDependencies.length > 0) {
      disposition = "CONFLICT";
    } else if (entity.disposition === "REQUIRES_REAUTH") {
      disposition = "REQUIRES_REAUTH";
    } else {
      disposition = "CREATE";
      idMap[refKey(entity)] = null;
    }

    items.push({
      ...entity,
      disposition,
      ...(targetId ? { targetId } : {}),
      unresolvedDependencies,
    });
  }

  return {
    items,
    idMap,
    canApply: items.every(
      (item) =>
        item.disposition !== "CONFLICT" &&
        item.disposition !== "UNSUPPORTED" &&
        item.unresolvedDependencies.length === 0
    ),
  };
}
