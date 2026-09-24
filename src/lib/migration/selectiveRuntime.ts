import type { SelectiveMigrationApplyDeps } from "./selectiveApply.ts";
import { awaitStableRestorePoint } from "./selectiveRestorePoint.ts";
import { normalizeTargetEntities } from "./selectiveTarget.ts";

type JsonRecord = Record<string, unknown>;

interface BackupDescriptor {
  filename: string;
  size: number;
}

interface BackupListEntry {
  id?: string;
  filename: string;
  size: number;
}

export interface SelectiveMigrationRuntimeDeps {
  getProviderConnections(
    filter?: JsonRecord,
    limit?: number,
    offset?: number,
    columns?: string[]
  ): Promise<unknown[]>;
  getProviderNodes(filter?: JsonRecord, limit?: number, offset?: number): Promise<unknown[]>;
  getCombos(limit?: number, offset?: number): Promise<unknown[]>;
  backupDbFile(reason?: string): BackupDescriptor | null;
  listDbBackups(): Promise<BackupListEntry[]>;
  restoreDbBackup(id: string): Promise<unknown>;
  createProviderConnection(data: JsonRecord): Promise<JsonRecord>;
  createProviderNode(data: JsonRecord): Promise<JsonRecord>;
  createCombo(data: JsonRecord): Promise<JsonRecord>;
  updateSettings(data: JsonRecord): Promise<JsonRecord>;
  sleep?(ms: number): Promise<void>;
}

const TARGET_PROVIDER_COLUMNS = [
  "id",
  "provider",
  "auth_type",
  "name",
  "email",
] as const;

export interface SelectiveMigrationRuntime {
  readTargetEntities(): Promise<ReturnType<typeof normalizeTargetEntities>>;
  applyDeps: SelectiveMigrationApplyDeps;
}

export function createSelectiveMigrationRuntime(
  deps: SelectiveMigrationRuntimeDeps
): SelectiveMigrationRuntime {
  return {
    async readTargetEntities() {
      const [providerConnections, providerNodes, combos] = await Promise.all([
        deps.getProviderConnections(
          {},
          undefined,
          undefined,
          [...TARGET_PROVIDER_COLUMNS]
        ),
        deps.getProviderNodes(),
        deps.getCombos(),
      ]);

      return normalizeTargetEntities({
        providerConnections,
        providerNodes,
        combos,
      });
    },

    applyDeps: {
      async createRestorePoint() {
        const stable = await awaitStableRestorePoint({
          createBackup: () => deps.backupDbFile("manual"),
          listBackups: deps.listDbBackups,
          ...(deps.sleep ? { sleep: deps.sleep } : {}),
        });
        return { id: stable.id };
      },

      async restoreRestorePoint(id: string) {
        await deps.restoreDbBackup(id);
      },

      createProviderConnection: deps.createProviderConnection,
      createProviderNode: deps.createProviderNode,
      createCombo: deps.createCombo,
      updateSettings: deps.updateSettings,
    },
  };
}
