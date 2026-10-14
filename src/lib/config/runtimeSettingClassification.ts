import { FEATURE_FLAG_DEFINITIONS } from "@/shared/constants/featureFlagDefinitions";
import { updateSettingsSchema } from "@/shared/validation/settingsSchemas";

export type RuntimeSettingClass =
  "HOT_ATOMIC" | "HOT_RECONCILE" | "RESTART_REQUIRED" | "BUILD_DEPLOY_ONLY";

const HOT_RECONCILE_KEYS = new Set(["modelsDevSyncEnabled", "modelsDevSyncInterval"]);
const BUILD_DEPLOY_ONLY_KEYS = new Set(["DATA_DIR", "SQLITE_FILE"]);
const KNOWN_FEATURE_FLAGS = new Set(FEATURE_FLAG_DEFINITIONS.map((definition) => definition.key));
const HOT_ATOMIC_RUNTIME_SETTING_KEYS = new Set([
  "autoDisableBannedScope",
  "call_log_pipeline_enabled",
  "cloudEnabled",
  "comboAutoPromoteEnabled",
  "idempotencyWindowMs",
  "tailscaleEnabled",
  "tailscaleUrl",
  "payloadRules",
  "modelAliases",
  "backgroundDegradation",
  "cliCompatProviders",
  "alwaysPreserveClientCache",
  "antigravitySignatureCacheMode",
  "usageTokenBuffer",
  "hideHealthCheckLogs",
  "corsOrigins",
  "ccBridgeTransforms",
  "systemTransforms",
  "systemPrompt",
  "localOnlyManageScopeBypassEnabled",
  "localOnlyManageScopeBypassPrefixes",
  "customBannedSignals",
  "providerErrorRules",
  "thinkingBudget",
  "taskRouting",
]);
const RESTART_REQUIRED_FEATURE_FLAGS = new Set(
  FEATURE_FLAG_DEFINITIONS.filter((definition) => definition.requiresRestart).map(
    (definition) => definition.key
  )
);
const KNOWN_OPERATOR_SETTING_KEYS = new Set(Object.keys(updateSettingsSchema.shape));

export function classifyRuntimeSettingKey(key: string): RuntimeSettingClass {
  if (BUILD_DEPLOY_ONLY_KEYS.has(key)) return "BUILD_DEPLOY_ONLY";
  if (RESTART_REQUIRED_FEATURE_FLAGS.has(key)) return "RESTART_REQUIRED";
  if (HOT_RECONCILE_KEYS.has(key)) return "HOT_RECONCILE";
  if (
    KNOWN_FEATURE_FLAGS.has(key) ||
    KNOWN_OPERATOR_SETTING_KEYS.has(key) ||
    HOT_ATOMIC_RUNTIME_SETTING_KEYS.has(key)
  ) {
    return "HOT_ATOMIC";
  }
  return "RESTART_REQUIRED";
}
