import { setHealthCheckLogCache } from "@/lib/tokenHealthCheck";
import { setCustomBannedSignals } from "@agentproxy/open-sse/services/accountFallback.ts";
import {
  setOperatorProviderErrorRules,
  type OperatorProviderErrorRule,
} from "@agentproxy/open-sse/config/providerErrorRules.ts";
import { isAutomatedTestProcess } from "@/shared/utils/testProcess";
import {
  activateRuntimeConfigCandidate,
  resetRuntimeConfigAuthorityForTests,
  type RuntimeConfigCandidate,
  type RuntimeConfigSnapshot,
} from "./runtimeConfigAuthority";

type JsonRecord = Record<string, unknown>;

export type RuntimeReloadSection =
  | "payloadRules"
  | "modelAliases"
  | "backgroundDegradation"
  | "cliCompatProviders"
  | "cacheControl"
  | "usageTracking"
  | "healthCheckLogs"
  | "thoughtSignature"
  | "modelsDevSync"
  | "corsOrigins"
  | "ccBridgeTransforms"
  | "systemTransforms"
  | "systemPrompt"
  | "authzBypass"
  | "bannedSignals"
  | "providerErrorRules"
  | "thinkingBudget"
  | "taskRouting";

export interface RuntimeReloadChange {
  section: RuntimeReloadSection;
  source: string;
}

interface AuthzBypassSnapshot {
  enabled: boolean;
  prefixes: string[];
}

interface RuntimeSettingsSnapshot {
  payloadRules: unknown;
  modelAliases: Record<string, string>;
  backgroundDegradation: JsonRecord | null;
  cliCompatProviders: string[];
  alwaysPreserveClientCache: string;
  antigravitySignatureCacheMode: string;
  usageTokenBuffer: unknown;
  hideHealthCheckLogs: boolean;
  modelsDevSyncEnabled: boolean;
  modelsDevSyncInterval: number | null;
  corsOrigins: string;
  ccBridgeTransforms: unknown;
  systemTransforms: unknown;
  systemPrompt: unknown;
  authzBypass: AuthzBypassSnapshot;
  customBannedSignals: string[];
  providerErrorRules: Record<string, OperatorProviderErrorRule[]> | null;
  thinkingBudget: JsonRecord | null;
  taskRouting: JsonRecord | null;
}

// Default bypass policy: kill-switch on, `/api/mcp/` bypassable. Mirrors the
// pre-T-011 compile-time constant so the route guard works identically before
// the first `applyRuntimeSettings` call (e.g. cold-boot requests).
const DEFAULT_AUTHZ_BYPASS_SNAPSHOT: AuthzBypassSnapshot = {
  enabled: true,
  prefixes: ["/api/mcp/"],
};

const DEFAULT_RUNTIME_SETTINGS_SNAPSHOT: RuntimeSettingsSnapshot = {
  payloadRules: null,
  modelAliases: {},
  backgroundDegradation: null,
  cliCompatProviders: [],
  alwaysPreserveClientCache: "auto",
  antigravitySignatureCacheMode: "enabled",
  usageTokenBuffer: null,
  hideHealthCheckLogs: false,
  modelsDevSyncEnabled: false,
  modelsDevSyncInterval: null,
  corsOrigins: "",
  ccBridgeTransforms: null,
  systemTransforms: null,
  systemPrompt: null,
  authzBypass: DEFAULT_AUTHZ_BYPASS_SNAPSHOT,
  customBannedSignals: [],
  providerErrorRules: null,
  thinkingBudget: null,
  taskRouting: null,
};

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

function isTruthyEnvFlag(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  return new Set(["1", "true", "yes", "on"]).has(value.trim().toLowerCase());
}

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as JsonRecord)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalize((value as JsonRecord)[key])])
    );
  }

  return value;
}

function parseStoredJson(value: unknown, field: string): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn(
      `[HOT_RELOAD] Failed to parse persisted settings field "${field}":`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry) => entry.length > 0)
    )
  );
}

/**
 * Defensive shape-check of operator-declared error rules pulled from settings.
 * The settings schema already validates this on write; this guard prevents a
 * malformed stored value (or an unexpected shape) from crashing the
 * error-classification hot path. Returns null when the value is missing or not
 * a record of non-empty rule arrays.
 */
function normalizeOperatorProviderErrorRules(
  value: unknown
): Record<string, OperatorProviderErrorRule[]> | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const result: Record<string, OperatorProviderErrorRule[]> = {};
  for (const [provider, list] of Object.entries(record)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const rules = list.filter(
      (entry): entry is OperatorProviderErrorRule =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as OperatorProviderErrorRule).status === "number" &&
        typeof (entry as OperatorProviderErrorRule).match === "string" &&
        typeof (entry as OperatorProviderErrorRule).scope === "string"
    );
    if (rules.length > 0) result[provider.toLowerCase()] = rules;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function normalizeStringRecord(value: unknown): Record<string, string> {
  const record = toRecord(parseStoredJson(value, "modelAliases"));
  const entries = Object.entries(record)
    .map(([key, entryValue]) => [
      key.trim(),
      typeof entryValue === "string" ? entryValue.trim() : "",
    ])
    .filter(([key, entryValue]) => key.length > 0 && entryValue.length > 0);

  return Object.fromEntries(entries);
}

function normalizeBackgroundDegradation(value: unknown): JsonRecord | null {
  const record = toRecord(parseStoredJson(value, "backgroundDegradation"));
  if (Object.keys(record).length === 0) return null;

  const degradationMap = Object.fromEntries(
    Object.entries(toRecord(record.degradationMap))
      .map(([key, entryValue]) => [
        key.trim(),
        typeof entryValue === "string" ? entryValue.trim() : "",
      ])
      .filter(([key, entryValue]) => key.length > 0 && entryValue.length > 0)
  );
  const detectionPatterns = normalizeStringArray(record.detectionPatterns);

  return {
    enabled: record.enabled === true,
    degradationMap,
    detectionPatterns,
  };
}

function normalizeOptionalRecord(value: unknown, field: string): JsonRecord | null {
  const record = toRecord(parseStoredJson(value, field));
  return Object.keys(record).length > 0 ? record : null;
}

function normalizeTaskRouting(value: unknown): JsonRecord | null {
  const record = normalizeOptionalRecord(value, "taskRouting");
  if (!record) return null;
  const { stats: _ignoredStats, ...persisted } = record;
  return persisted;
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePayloadRules(value: unknown): unknown {
  return parseStoredJson(value, "payloadRules");
}

function normalizeAuthzBypass(settings: Record<string, unknown>): AuthzBypassSnapshot {
  const enabled =
    settings.localOnlyManageScopeBypassEnabled === false
      ? false
      : settings.localOnlyManageScopeBypassEnabled === true
        ? true
        : DEFAULT_AUTHZ_BYPASS_SNAPSHOT.enabled;
  const rawPrefixes = settings.localOnlyManageScopeBypassPrefixes;
  const prefixes = Array.isArray(rawPrefixes)
    ? Array.from(
        new Set(
          rawPrefixes
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => entry.length > 0 && entry.startsWith("/"))
        )
      )
    : [...DEFAULT_AUTHZ_BYPASS_SNAPSHOT.prefixes];
  return { enabled, prefixes };
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

export function buildRuntimeSettingsSnapshot(
  settings: Readonly<Record<string, unknown>>
): RuntimeSettingsSnapshot {
  return {
    payloadRules: normalizePayloadRules(settings.payloadRules),
    modelAliases: normalizeStringRecord(settings.modelAliases),
    backgroundDegradation: normalizeBackgroundDegradation(settings.backgroundDegradation),
    cliCompatProviders: normalizeStringArray(settings.cliCompatProviders),
    alwaysPreserveClientCache:
      typeof settings.alwaysPreserveClientCache === "string"
        ? settings.alwaysPreserveClientCache
        : DEFAULT_RUNTIME_SETTINGS_SNAPSHOT.alwaysPreserveClientCache,
    antigravitySignatureCacheMode:
      typeof settings.antigravitySignatureCacheMode === "string"
        ? settings.antigravitySignatureCacheMode
        : DEFAULT_RUNTIME_SETTINGS_SNAPSHOT.antigravitySignatureCacheMode,
    usageTokenBuffer: settings.usageTokenBuffer ?? null,
    hideHealthCheckLogs: settings.hideHealthCheckLogs === true,
    modelsDevSyncEnabled: settings.modelsDevSyncEnabled === true,
    modelsDevSyncInterval: normalizeNumber(settings.modelsDevSyncInterval),
    corsOrigins: typeof settings.corsOrigins === "string" ? settings.corsOrigins : "",
    ccBridgeTransforms: parseStoredJson(settings.ccBridgeTransforms, "ccBridgeTransforms"),
    systemTransforms: parseStoredJson(settings.systemTransforms, "systemTransforms"),
    systemPrompt: settings.systemPrompt
      ? parseStoredJson(settings.systemPrompt, "systemPrompt")
      : null,
    authzBypass: normalizeAuthzBypass(settings),
    customBannedSignals: normalizeStringArray(settings.customBannedSignals),
    providerErrorRules: normalizeOperatorProviderErrorRules(settings.providerErrorRules),
    thinkingBudget: normalizeOptionalRecord(settings.thinkingBudget, "thinkingBudget"),
    taskRouting: normalizeTaskRouting(settings.taskRouting),
  };
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

type RuntimeSettingsFaultInjector = (section: RuntimeReloadSection) => void;
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
  }
): Promise<RuntimeReloadChange[]> {
  const { force, source, allowFaultInjection } = options;
  const changes: RuntimeReloadChange[] = [];
  const markChanged = (section: RuntimeReloadSection) => {
    changes.push({ section, source });
    if (allowFaultInjection) runtimeSettingsFaultInjectorForTests?.(section);
  };

  if (force || hasChanged(currentSnapshot.payloadRules, previousSnapshot.payloadRules)) {
    await applyPayloadRulesSection(currentSnapshot.payloadRules);
    markChanged("payloadRules");
  }

  if (force || hasChanged(currentSnapshot.modelAliases, previousSnapshot.modelAliases)) {
    await applyModelAliasesSection(currentSnapshot.modelAliases);
    markChanged("modelAliases");
  }

  if (
    force ||
    hasChanged(currentSnapshot.backgroundDegradation, previousSnapshot.backgroundDegradation)
  ) {
    await applyBackgroundDegradationSection(currentSnapshot.backgroundDegradation);
    markChanged("backgroundDegradation");
  }

  if (
    force ||
    hasChanged(currentSnapshot.cliCompatProviders, previousSnapshot.cliCompatProviders)
  ) {
    await applyCliCompatProvidersSection(currentSnapshot.cliCompatProviders);
    markChanged("cliCompatProviders");
  }

  if (
    force ||
    hasChanged(
      currentSnapshot.alwaysPreserveClientCache,
      previousSnapshot.alwaysPreserveClientCache
    )
  ) {
    await applyCacheControlSection(currentSnapshot.alwaysPreserveClientCache);
    markChanged("cacheControl");
  }

  if (force || hasChanged(currentSnapshot.usageTokenBuffer, previousSnapshot.usageTokenBuffer)) {
    await applyUsageTrackingSection(
      typeof currentSnapshot.usageTokenBuffer === "number" ? currentSnapshot.usageTokenBuffer : null
    );
    markChanged("usageTracking");
  }

  if (force || currentSnapshot.hideHealthCheckLogs !== previousSnapshot.hideHealthCheckLogs) {
    setHealthCheckLogCache(currentSnapshot.hideHealthCheckLogs);
    markChanged("healthCheckLogs");
  }

  if (
    force ||
    hasChanged(
      currentSnapshot.antigravitySignatureCacheMode,
      previousSnapshot.antigravitySignatureCacheMode
    )
  ) {
    await applyThoughtSignatureSection(currentSnapshot.antigravitySignatureCacheMode);
    markChanged("thoughtSignature");
  }

  if (force || hasChanged(currentSnapshot.corsOrigins, previousSnapshot.corsOrigins)) {
    await applyCorsOriginsSection(currentSnapshot.corsOrigins);
    markChanged("corsOrigins");
  }

  if (
    force ||
    hasChanged(currentSnapshot.ccBridgeTransforms, previousSnapshot.ccBridgeTransforms)
  ) {
    await applyCcBridgeTransformsSection(currentSnapshot.ccBridgeTransforms);
    markChanged("ccBridgeTransforms");
  }

  if (force || hasChanged(currentSnapshot.systemTransforms, previousSnapshot.systemTransforms)) {
    await applySystemTransformsSection(currentSnapshot.systemTransforms);
    markChanged("systemTransforms");
  }

  if (force || hasChanged(currentSnapshot.systemPrompt, previousSnapshot.systemPrompt)) {
    await applySystemPromptSection(currentSnapshot.systemPrompt);
    markChanged("systemPrompt");
  }

  if (force || hasChanged(currentSnapshot.authzBypass, previousSnapshot.authzBypass)) {
    applyAuthzBypassSection(currentSnapshot.authzBypass);
    markChanged("authzBypass");
  }

  if (
    force ||
    hasChanged(currentSnapshot.customBannedSignals, previousSnapshot.customBannedSignals)
  ) {
    setCustomBannedSignals(currentSnapshot.customBannedSignals);
    markChanged("bannedSignals");
  }

  if (
    force ||
    hasChanged(currentSnapshot.providerErrorRules, previousSnapshot.providerErrorRules)
  ) {
    setOperatorProviderErrorRules(currentSnapshot.providerErrorRules ?? undefined);
    markChanged("providerErrorRules");
  }

  if (force || hasChanged(currentSnapshot.thinkingBudget, previousSnapshot.thinkingBudget)) {
    await applyThinkingBudgetSection(currentSnapshot.thinkingBudget);
    markChanged("thinkingBudget");
  }

  if (force || hasChanged(currentSnapshot.taskRouting, previousSnapshot.taskRouting)) {
    await applyTaskRoutingSection(currentSnapshot.taskRouting);
    markChanged("taskRouting");
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
        { force, source, allowFaultInjection: true }
      );
    },
    rollbackAtomic: async (preparedCandidate) => {
      if (!preparedCandidate) return;
      await applyAtomicRuntimeSections(preparedCandidate.current, preparedCandidate.previous, {
        force: true,
        source: `${source}:rollback`,
        allowFaultInjection: false,
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
