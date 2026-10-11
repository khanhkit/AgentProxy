import { FEATURE_FLAG_DEFINITIONS } from "@/shared/constants/featureFlagDefinitions";

export type RuntimeSettingClass =
  "HOT_ATOMIC" | "HOT_RECONCILE" | "RESTART_REQUIRED" | "BUILD_DEPLOY_ONLY";

const HOT_RECONCILE_KEYS = new Set(["modelsDevSyncEnabled", "modelsDevSyncInterval"]);
const BUILD_DEPLOY_ONLY_KEYS = new Set(["DATA_DIR", "SQLITE_FILE"]);
const RESTART_REQUIRED_FEATURE_FLAGS = new Set(
  FEATURE_FLAG_DEFINITIONS.filter((definition) => definition.requiresRestart).map(
    (definition) => definition.key
  )
);

export function classifyRuntimeSettingKey(key: string): RuntimeSettingClass {
  if (BUILD_DEPLOY_ONLY_KEYS.has(key)) return "BUILD_DEPLOY_ONLY";
  if (RESTART_REQUIRED_FEATURE_FLAGS.has(key)) return "RESTART_REQUIRED";
  if (HOT_RECONCILE_KEYS.has(key)) return "HOT_RECONCILE";
  return "HOT_ATOMIC";
}
