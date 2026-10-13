import { clearHealthCheckLogCache } from "@/lib/tokenHealthCheck";
import { setCustomBannedSignals } from "@agentproxy/open-sse/services/accountFallback.ts";
import { setOperatorProviderErrorRules } from "@agentproxy/open-sse/config/providerErrorRules.ts";
import { isAutomatedTestProcess } from "@/shared/utils/testProcess";
import {
  activateRuntimeConfigCandidate,
  resetRuntimeConfigAuthorityForTests,
  type RuntimeConfigCandidate,
  type RuntimeConfigSnapshot,
} from "./runtimeConfigAuthority";
import {
  buildRuntimeSettingsSnapshot,
  DEFAULT_AUTHZ_BYPASS_SNAPSHOT,
  DEFAULT_RUNTIME_SETTINGS_SNAPSHOT,
  isTruthyEnvFlag,
  normalizeStringArray,
  normalizeStringRecord,
  stableSerialize,
  type AuthzBypassSnapshot,
  type JsonRecord,
  type RuntimeReloadChange,
  type RuntimeReloadSection,
  type RuntimeSettingsSnapshot,
} from "./runtimeSettingsSnapshot";

export { buildRuntimeSettingsSnapshot } from "./runtimeSettingsSnapshot";
export type { RuntimeReloadChange, RuntimeReloadSection } from "./runtimeSettingsSnapshot";

let lastAppliedSnapshot: RuntimeSettingsSnapshot | null = null;

// Shared bypass-policy store. A globalThis-backed value is visible to every
// independently evaluated server bundle/chunk that imports this module.
const AUTHZ_BYPASS_GLOBAL_KEY = "__omniroute_authzBypass_config__";
const authzBypassStore = globalThis as unknown as Record<string, AuthzBypassSnapshot | undefined>;

function getCurrentAuthzBypass(): AuthzBypassSnapshot {
  if (!authzBypassStore[AUTHZ_BYPASS_GLOBAL_KEY]) {
    authzBypassStore[AUTHZ_BYPASS_GLOBAL_KEY] = DEFAULT_AUTHZ_BYPASS_SNAPSHOT;
  }
  return authzBypassStore[AUTHZ_BYPASS_GLOBAL_KEY]!;
}

function setCurrentAuthzBypass(snapshot: AuthzBypassSnapshot): void {
  authzBypassStore[AUTHZ_BYPASS_GLOBAL_KEY] = snapshot;
}

/**
 * O(1) accessor for the current LOCAL_ONLY manage-scope bypass policy.
 *
 * Consumed by the route-guard hot path (`isLocalOnlyBypassableByManageScope`).
 * Returns the default snapshot (`{ enabled: true, prefixes: ["/api/mcp/"] }`)
 * before the first `applyRuntimeSettings` call so cold-boot requests behave
 * identically to PR #2473. Mutated only by `applyAuthzBypassSection`.
 *
 * Hot-reload latency: <50 ms (no I/O, no async, pure read of module-local
 * state). Spec §Non-Functional Requirements / Performance.
 */
export function getAuthzBypassSnapshot(): AuthzBypassSnapshot {
  return getCurrentAuthzBypass();
}

function getPreviousSnapshot(): RuntimeSettingsSnapshot {
  return lastAppliedSnapshot || DEFAULT_RUNTIME_SETTINGS_SNAPSHOT;
}

async function applyPayloadRulesSection(payloadRules: unknown) {
  const { setPayloadRulesConfig, setPayloadRulesFileFallback } =
    await import("@agentproxy/open-sse/services/payloadRules.ts");

  if (payloadRules === null || payloadRules === undefined) {
    setPayloadRulesFileFallback();
    return;
  }

  setPayloadRulesConfig(payloadRules);
}

async function applyModelAliasesSection(modelAliases: Record<string, string>) {
  const { setCustomAliases } = await import("@agentproxy/open-sse/services/modelDeprecation.ts");
  setCustomAliases(modelAliases);
}

async function applyBackgroundDegradationSection(backgroundDegradation: JsonRecord | null) {
  const { getDefaultDegradationMap, getDefaultDetectionPatterns, setBackgroundDegradationConfig } =
    await import("@agentproxy/open-sse/services/backgroundTaskDetector.ts");

  if (!backgroundDegradation) {
    setBackgroundDegradationConfig({
      enabled: false,
      degradationMap: getDefaultDegradationMap(),
      detectionPatterns: getDefaultDetectionPatterns(),
    });
    return;
  }

  setBackgroundDegradationConfig({
    enabled: backgroundDegradation.enabled === true,
    degradationMap: {
      ...getDefaultDegradationMap(),
      ...normalizeStringRecord(backgroundDegradation.degradationMap),
    },
    detectionPatterns:
      normalizeStringArray(backgroundDegradation.detectionPatterns).length > 0
        ? normalizeStringArray(backgroundDegradation.detectionPatterns)
        : getDefaultDetectionPatterns(),
  });
}

async function applyCliCompatProvidersSection(cliCompatProviders: string[]) {
  const { setCliCompatProviders } = await import("@agentproxy/open-sse/config/cliFingerprints");
  setCliCompatProviders(cliCompatProviders);
}

async function applyCacheControlSection(mode: string) {
  const { setCacheControlSettingsCache } = await import("@/lib/cacheControlSettings");
  setCacheControlSettingsCache(mode as "auto" | "always" | "never");
}

async function applyUsageTrackingSection(newBuffer: number | null) {
  const { setRuntimeBufferTokensCache } =
    await import("@agentproxy/open-sse/utils/usageTracking.ts");
  setRuntimeBufferTokensCache(newBuffer);
}

async function applyThoughtSignatureSection(mode: string) {
  const { setGeminiThoughtSignatureMode } =
    await import("@agentproxy/open-sse/services/geminiThoughtSignatureStore.ts");
  setGeminiThoughtSignatureMode(mode);
}

async function applyCorsOriginsSection(corsOrigins: string) {
  const { setRuntimeAllowedOrigins } = await import("@/server/cors/origins");
  setRuntimeAllowedOrigins(corsOrigins);
}

/**
 * Legacy alias for the v2 systemTransforms config. The `ccBridgeTransforms`
 * settings field carried the single-provider shape `{ enabled, pipeline }`
 * during Phase 2 (commit e3e962db, pre-release). v2 unifies everything under
 * `systemTransforms.providers[*]`. We migrate the legacy shape into the v2
 * registry on every reload so users with persisted Phase-2 data keep working.
 *
 * `setSystemTransformsConfig` accepts both shapes and routes legacy into
 * `providers[PROVIDER_CC_BRIDGE]`.
 */
async function applyCcBridgeTransformsSection(ccBridgeTransforms: unknown) {
  const { setSystemTransformsConfig } =
    await import("@agentproxy/open-sse/services/systemTransforms.ts");
  if (ccBridgeTransforms && typeof ccBridgeTransforms === "object") {
    setSystemTransformsConfig(ccBridgeTransforms);
  }
}

/**
 * Swap the in-process bypass policy. Synchronous, O(1), no I/O — the SLA
 * (<50 ms hot-reload) is structurally satisfied by this shape.
 */
function applyAuthzBypassSection(snapshot: AuthzBypassSnapshot) {
  setCurrentAuthzBypass({ enabled: snapshot.enabled, prefixes: [...snapshot.prefixes] });
}

async function applySystemTransformsSection(systemTransforms: unknown) {
  const { setSystemTransformsConfig, resetSystemTransformsConfig } =
    await import("@agentproxy/open-sse/services/systemTransforms.ts");

  if (
    systemTransforms === null ||
    systemTransforms === undefined ||
    typeof systemTransforms !== "object"
  ) {
    resetSystemTransformsConfig();
    return;
  }

  setSystemTransformsConfig(systemTransforms);
}

async function applySystemPromptSection(systemPrompt: unknown) {
  const { setSystemPromptConfig } = await import("@agentproxy/open-sse/services/systemPrompt.ts");

  if (systemPrompt && typeof systemPrompt === "object") {
    setSystemPromptConfig(systemPrompt as Record<string, unknown>);
  } else {
    setSystemPromptConfig({
      enabled: false,
      prefixPrompt: "",
      suffixPrompt: "",
      prompt: "",
    });
  }
}

async function applyThinkingBudgetSection(thinkingBudget: JsonRecord | null) {
  const { DEFAULT_THINKING_CONFIG, setThinkingBudgetConfig } =
    await import("@agentproxy/open-sse/services/thinkingBudget.ts");
  setThinkingBudgetConfig(thinkingBudget ?? DEFAULT_THINKING_CONFIG);
}

async function applyTaskRoutingSection(taskRouting: JsonRecord | null) {
  const { getDefaultTaskModelMap, setTaskRoutingConfig } =
    await import("@agentproxy/open-sse/services/taskAwareRouter.ts");
  setTaskRoutingConfig({
    enabled: false,
    detectionEnabled: true,
    taskModelMap: getDefaultTaskModelMap(),
    patternOverrides: undefined,
  });
  if (taskRouting) {
    setTaskRoutingConfig(taskRouting as Parameters<typeof setTaskRoutingConfig>[0]);
  }
}

async function applyModelsDevSyncSection(
  previousSnapshot: RuntimeSettingsSnapshot,
  currentSnapshot: RuntimeSettingsSnapshot,
  force: boolean
) {
  const {
    startPeriodicSync,
    stopPeriodicSync,
    isModelsDevSyncEnvDisabled,
    isModelsDevSyncEnvForcedOn,
  } = await import("@/lib/modelsDevSync");
  const skipBackgroundSyncInTests =
    (isAutomatedTestProcess() && process.env.AGENTPROXY_ENABLE_RUNTIME_BACKGROUND_TASKS !== "1") ||
    isTruthyEnvFlag(process.env.AGENTPROXY_DISABLE_BACKGROUND_SERVICES);

  if (skipBackgroundSyncInTests || isModelsDevSyncEnvDisabled()) {
    stopPeriodicSync();
    return;
  }

  const wasEnabled = previousSnapshot.modelsDevSyncEnabled === true;
  const isEnabled = isModelsDevSyncEnvForcedOn() || currentSnapshot.modelsDevSyncEnabled === true;
  const intervalChanged =
    previousSnapshot.modelsDevSyncInterval !== currentSnapshot.modelsDevSyncInterval;

  if (!isEnabled) {
    if (wasEnabled || force) {
      stopPeriodicSync();
    }
    return;
  }

  if (force) {
    stopPeriodicSync();
    startPeriodicSync(currentSnapshot.modelsDevSyncInterval || undefined);
    return;
  }

  if (!wasEnabled) {
    startPeriodicSync(currentSnapshot.modelsDevSyncInterval || undefined);
    return;
  }

  if (intervalChanged) {
    stopPeriodicSync();
    startPeriodicSync(currentSnapshot.modelsDevSyncInterval || undefined);
  }
}

type RuntimeSettingsFaultPhase = "apply" | "rollback";
type RuntimeSettingsFaultInjector = (
  section: RuntimeReloadSection,
  phase: RuntimeSettingsFaultPhase
) => void;
let runtimeSettingsFaultInjectorForTests: RuntimeSettingsFaultInjector | null = null;

export function setRuntimeSettingsFaultInjectorForTests(
  injector: RuntimeSettingsFaultInjector | null
): void {
  runtimeSettingsFaultInjectorForTests = injector;
}

function hasChanged<T>(currentValue: T, previousValue: T): boolean {
  return stableSerialize(currentValue) !== stableSerialize(previousValue);
}

async function applyAtomicRuntimeSections(
  previousSnapshot: RuntimeSettingsSnapshot,
  currentSnapshot: RuntimeSettingsSnapshot,
  options: {
    force: boolean;
    source: string;
    allowFaultInjection: boolean;
    faultInjectionPhase: RuntimeSettingsFaultPhase;
    continueOnError?: boolean;
  }
): Promise<RuntimeReloadChange[]> {
  const {
    force,
    source,
    allowFaultInjection,
    faultInjectionPhase,
    continueOnError = false,
  } = options;
  const changes: RuntimeReloadChange[] = [];
  const failures: Array<{ section: RuntimeReloadSection; error: unknown }> = [];
  const markChanged = (section: RuntimeReloadSection) => {
    changes.push({ section, source });
    if (allowFaultInjection) runtimeSettingsFaultInjectorForTests?.(section, faultInjectionPhase);
  };
  const runSection = async (
    section: RuntimeReloadSection,
    shouldApply: boolean,
    apply: () => void | Promise<void>
  ) => {
    if (!shouldApply) return;
    try {
      await apply();
      markChanged(section);
    } catch (error) {
      if (!continueOnError) throw error;
      failures.push({ section, error });
    }
  };

  await runSection(
    "payloadRules",
    force || hasChanged(currentSnapshot.payloadRules, previousSnapshot.payloadRules),
    () => applyPayloadRulesSection(currentSnapshot.payloadRules)
  );
  await runSection(
    "modelAliases",
    force || hasChanged(currentSnapshot.modelAliases, previousSnapshot.modelAliases),
    () => applyModelAliasesSection(currentSnapshot.modelAliases)
  );
  await runSection(
    "backgroundDegradation",
    force ||
      hasChanged(currentSnapshot.backgroundDegradation, previousSnapshot.backgroundDegradation),
    () => applyBackgroundDegradationSection(currentSnapshot.backgroundDegradation)
  );
  await runSection(
    "cliCompatProviders",
    force || hasChanged(currentSnapshot.cliCompatProviders, previousSnapshot.cliCompatProviders),
    () => applyCliCompatProvidersSection(currentSnapshot.cliCompatProviders)
  );
  await runSection(
    "cacheControl",
    force ||
      hasChanged(
        currentSnapshot.alwaysPreserveClientCache,
        previousSnapshot.alwaysPreserveClientCache
      ),
    () => applyCacheControlSection(currentSnapshot.alwaysPreserveClientCache)
  );
  await runSection(
    "usageTracking",
    force || hasChanged(currentSnapshot.usageTokenBuffer, previousSnapshot.usageTokenBuffer),
    () =>
      applyUsageTrackingSection(
        typeof currentSnapshot.usageTokenBuffer === "number"
          ? currentSnapshot.usageTokenBuffer
          : null
      )
  );
  await runSection(
    "healthCheckLogs",
    force || currentSnapshot.hideHealthCheckLogs !== previousSnapshot.hideHealthCheckLogs,
    () => clearHealthCheckLogCache(currentSnapshot.hideHealthCheckLogs)
  );
  await runSection(
    "thoughtSignature",
    force ||
      hasChanged(
        currentSnapshot.antigravitySignatureCacheMode,
        previousSnapshot.antigravitySignatureCacheMode
      ),
    () => applyThoughtSignatureSection(currentSnapshot.antigravitySignatureCacheMode)
  );
  await runSection(
    "corsOrigins",
    force || hasChanged(currentSnapshot.corsOrigins, previousSnapshot.corsOrigins),
    () => applyCorsOriginsSection(currentSnapshot.corsOrigins)
  );
  await runSection(
    "ccBridgeTransforms",
    force || hasChanged(currentSnapshot.ccBridgeTransforms, previousSnapshot.ccBridgeTransforms),
    () => applyCcBridgeTransformsSection(currentSnapshot.ccBridgeTransforms)
  );
  await runSection(
    "systemTransforms",
    force || hasChanged(currentSnapshot.systemTransforms, previousSnapshot.systemTransforms),
    () => applySystemTransformsSection(currentSnapshot.systemTransforms)
  );
  await runSection(
    "systemPrompt",
    force || hasChanged(currentSnapshot.systemPrompt, previousSnapshot.systemPrompt),
    () => applySystemPromptSection(currentSnapshot.systemPrompt)
  );
  await runSection(
    "authzBypass",
    force || hasChanged(currentSnapshot.authzBypass, previousSnapshot.authzBypass),
    () => applyAuthzBypassSection(currentSnapshot.authzBypass)
  );
  await runSection(
    "bannedSignals",
    force || hasChanged(currentSnapshot.customBannedSignals, previousSnapshot.customBannedSignals),
    () => setCustomBannedSignals(currentSnapshot.customBannedSignals)
  );
  await runSection(
    "providerErrorRules",
    force || hasChanged(currentSnapshot.providerErrorRules, previousSnapshot.providerErrorRules),
    () => setOperatorProviderErrorRules(currentSnapshot.providerErrorRules ?? undefined)
  );
  await runSection(
    "thinkingBudget",
    force || hasChanged(currentSnapshot.thinkingBudget, previousSnapshot.thinkingBudget),
    () => applyThinkingBudgetSection(currentSnapshot.thinkingBudget)
  );
  await runSection(
    "taskRouting",
    force || hasChanged(currentSnapshot.taskRouting, previousSnapshot.taskRouting),
    () => applyTaskRoutingSection(currentSnapshot.taskRouting)
  );

  if (failures.length > 0) {
    const details = failures
      .map(
        ({ section, error }) =>
          `${section}: ${error instanceof Error ? error.message : String(error)}`
      )
      .join("; ");
    throw new AggregateError(
      failures.map(({ error }) => error),
      `Runtime settings ${faultInjectionPhase} failed: ${details}`
    );
  }

  return changes;
}

async function reconcileRuntimeSections(
  previousSnapshot: RuntimeSettingsSnapshot,
  currentSnapshot: RuntimeSettingsSnapshot,
  options: { force: boolean; source: string }
): Promise<RuntimeReloadChange[]> {
  const { force, source } = options;
  if (
    !force &&
    currentSnapshot.modelsDevSyncEnabled === previousSnapshot.modelsDevSyncEnabled &&
    currentSnapshot.modelsDevSyncInterval === previousSnapshot.modelsDevSyncInterval
  ) {
    return [];
  }

  await applyModelsDevSyncSection(previousSnapshot, currentSnapshot, force);
  return [{ section: "modelsDevSync", source }];
}

export async function applyRuntimeSettingsCandidate(
  candidate: RuntimeConfigCandidate,
  options: { force?: boolean; source?: string } = {}
): Promise<RuntimeReloadChange[]> {
  const source = options.source || "runtime";
  const force = options.force === true;
  let prepared: { previous: RuntimeSettingsSnapshot; current: RuntimeSettingsSnapshot } | undefined;
  let changes: RuntimeReloadChange[] = [];

  const activatedSnapshot = await activateRuntimeConfigCandidate(candidate, {
    prepare: (snapshot: RuntimeConfigSnapshot, previousActive: RuntimeConfigSnapshot | null) => {
      prepared = {
        previous: previousActive
          ? buildRuntimeSettingsSnapshot(previousActive.settings)
          : DEFAULT_RUNTIME_SETTINGS_SNAPSHOT,
        current: buildRuntimeSettingsSnapshot(snapshot.settings),
      };
      return prepared;
    },
    applyAtomic: async (preparedCandidate) => {
      if (!preparedCandidate) throw new Error("Runtime settings candidate was not prepared");
      changes = await applyAtomicRuntimeSections(
        preparedCandidate.previous,
        preparedCandidate.current,
        { force, source, allowFaultInjection: true, faultInjectionPhase: "apply" }
      );
    },
    rollbackAtomic: async (preparedCandidate) => {
      if (!preparedCandidate) return;
      await applyAtomicRuntimeSections(preparedCandidate.current, preparedCandidate.previous, {
        force: true,
        source: `${source}:rollback`,
        allowFaultInjection: true,
        faultInjectionPhase: "rollback",
        continueOnError: true,
      });
    },
    reconcile: async (activeCandidate) => {
      const current = buildRuntimeSettingsSnapshot(activeCandidate.settings);
      const previous = prepared?.previous ?? current;
      changes.push(
        ...(await reconcileRuntimeSections(previous, current, {
          force: force || !prepared,
          source,
        }))
      );
    },
  });

  if (activatedSnapshot?.revision === candidate.revision) {
    lastAppliedSnapshot = buildRuntimeSettingsSnapshot(activatedSnapshot.settings);
  }

  return changes;
}

/**
 * Compatibility adapter for callers that do not yet have a durable revision.
 * Production settings writes and startup use applyRuntimeSettingsCandidate().
 */
export async function applyRuntimeSettings(
  settings: Record<string, unknown>,
  options: { force?: boolean; source?: string } = {}
): Promise<RuntimeReloadChange[]> {
  const source = options.source || "runtime";
  const force = options.force === true;
  const hasBootstrappedSnapshot = lastAppliedSnapshot !== null;
  const currentSnapshot = buildRuntimeSettingsSnapshot(settings);
  const previousSnapshot = getPreviousSnapshot();
  const changes = await applyAtomicRuntimeSections(previousSnapshot, currentSnapshot, {
    force,
    source,
    allowFaultInjection: true,
    faultInjectionPhase: "apply",
  });

  if (
    force ||
    (hasBootstrappedSnapshot &&
      (currentSnapshot.modelsDevSyncEnabled !== previousSnapshot.modelsDevSyncEnabled ||
        currentSnapshot.modelsDevSyncInterval !== previousSnapshot.modelsDevSyncInterval))
  ) {
    changes.push(
      ...(await reconcileRuntimeSections(previousSnapshot, currentSnapshot, { force, source }))
    );
  }

  lastAppliedSnapshot = currentSnapshot;
  return changes;
}

export function resetRuntimeSettingsStateForTests() {
  lastAppliedSnapshot = null;
  runtimeSettingsFaultInjectorForTests = null;
  setCurrentAuthzBypass(DEFAULT_AUTHZ_BYPASS_SNAPSHOT);
  resetRuntimeConfigAuthorityForTests();
}
