import { backupDbFile, listDbBackups, restoreDbBackup } from "@/lib/db/backup";
import { openDatabaseAsync } from "@/lib/db/adapters/driverFactory";
import { createCombo, getCombos } from "@/lib/db/combos";
import { getModelAliases, setModelAlias } from "@/lib/db/models";
import { getPricingWithSources, updatePricing } from "@/lib/db/settings/pricing";
import {
  createProviderConnection,
  getProviderConnections,
} from "@/lib/db/providers";
import {
  createProviderNode,
  getProviderNodes,
} from "@/lib/db/providers/nodes";
import { updateSettings } from "@/lib/db/settings";
import { handleSelectiveMigrationApplyRequest } from "@/lib/migration/selectiveApplyRequest";
import { createSelectiveMigrationRuntime } from "@/lib/migration/selectiveRuntime";
import { isAuthRequired, isAuthenticated } from "@/shared/utils/apiAuth";

const runtime = createSelectiveMigrationRuntime({
  getProviderConnections,
  getProviderNodes,
  getCombos,
  backupDbFile,
  listDbBackups,
  restoreDbBackup,
  createProviderConnection,
  createProviderNode,
  createCombo,
  updateSettings,
  getModelAliases,
  getPricingWithSources,
  setModelAlias,
  updatePricing,
});

export async function POST(request: Request) {
  return handleSelectiveMigrationApplyRequest(request, {
    isAuthRequired,
    isAuthenticated,
    openDatabase: openDatabaseAsync,
    readTargetEntities: runtime.readTargetEntities,
    applyDeps: runtime.applyDeps,
  });
}
