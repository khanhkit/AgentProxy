import { resolveFeatureFlag } from "@/shared/utils/featureFlags";
import { classifyRuntimeSettingKey } from "./runtimeSettingClassification";

export interface RuntimeConfigCandidate {
  revision: number;
  settings: Record<string, unknown>;
  featureFlagOverrides: Record<string, string>;
}

export interface RuntimeConfigSnapshot {
  revision: number;
  settings: Readonly<Record<string, unknown>>;
  featureFlagOverrides: Readonly<Record<string, string>>;
}

export type RuntimeConfigState =
  "uninitialized" | "ready" | "activation_failed" | "reconcile_pending";

export interface RuntimeConfigErrorStatus {
  revision: number;
  message: string;
}

export interface RuntimeConfigStatus {
  desiredRevision: number;
  activeRevision: number | null;
  state: RuntimeConfigState;
  lastError: RuntimeConfigErrorStatus | null;
  restartRequiredKeys: string[];
  reconcileRevision: number | null;
}

export interface RuntimeConfigActivationHooks<TPrepared = unknown> {
  prepare?: (
    candidate: RuntimeConfigSnapshot,
    previous: RuntimeConfigSnapshot | null
  ) => TPrepared | Promise<TPrepared>;
  applyAtomic?: (
    prepared: TPrepared | undefined,
    previous: RuntimeConfigSnapshot | null,
    candidate: RuntimeConfigSnapshot
  ) => void | Promise<void>;
  rollbackAtomic?: (
    prepared: TPrepared | undefined,
    previous: RuntimeConfigSnapshot | null,
    candidate: RuntimeConfigSnapshot
  ) => void | Promise<void>;
  reconcile?: (candidate: RuntimeConfigSnapshot) => void | Promise<void>;
}

interface RuntimeConfigAuthorityStore {
  desiredRevision: number;
  activeSnapshot: RuntimeConfigSnapshot | null;
  state: RuntimeConfigState;
  lastError: RuntimeConfigErrorStatus | null;
  restartRequiredKeys: string[];
  reconcileRevision: number | null;
  activationTail: Promise<void>;
}

interface AtomicPhaseResult {
  snapshot: RuntimeConfigSnapshot | null;
  shouldReconcile: boolean;
}

const AUTHORITY_GLOBAL_KEY = "__agentproxy_runtime_config_authority__";
const authorityGlobal = globalThis as unknown as Record<
  string,
  RuntimeConfigAuthorityStore | undefined
>;

function newStore(): RuntimeConfigAuthorityStore {
  return {
    desiredRevision: 0,
    activeSnapshot: null,
    state: "uninitialized",
    lastError: null,
    restartRequiredKeys: [],
    reconcileRevision: null,
    activationTail: Promise.resolve(),
  };
}

function getStore(): RuntimeConfigAuthorityStore {
  authorityGlobal[AUTHORITY_GLOBAL_KEY] ??= newStore();
  return authorityGlobal[AUTHORITY_GLOBAL_KEY]!;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}

function freezeCandidate(candidate: RuntimeConfigCandidate): RuntimeConfigSnapshot {
  const cloned = structuredClone({
    revision: candidate.revision,
    settings: candidate.settings,
    featureFlagOverrides: candidate.featureFlagOverrides,
  });
  return deepFreeze(cloned) as RuntimeConfigSnapshot;
}

function serializedEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function restartRequiredChanges(
  previous: RuntimeConfigSnapshot | null,
  candidate: RuntimeConfigSnapshot
): string[] {
  if (!previous) return [];
  const changed = new Set<string>();

  for (const key of new Set([
    ...Object.keys(previous.settings),
    ...Object.keys(candidate.settings),
  ])) {
    const settingClass = classifyRuntimeSettingKey(key);
    if (settingClass !== "RESTART_REQUIRED" && settingClass !== "BUILD_DEPLOY_ONLY") continue;
    if (!serializedEqual(previous.settings[key], candidate.settings[key])) changed.add(key);
  }

  for (const key of new Set([
    ...Object.keys(previous.featureFlagOverrides),
    ...Object.keys(candidate.featureFlagOverrides),
  ])) {
    if (classifyRuntimeSettingKey(key) !== "RESTART_REQUIRED") continue;
    const previousValue = resolveFeatureFlag(key, previous.featureFlagOverrides);
    const candidateValue = resolveFeatureFlag(key, candidate.featureFlagOverrides);
    if (previousValue !== candidateValue) changed.add(key);
  }

  return [...changed].sort();
}

function setActivationFailure(
  store: RuntimeConfigAuthorityStore,
  revision: number,
  error: unknown
): void {
  store.state = "activation_failed";
  store.lastError = { revision, message: errorMessage(error) };
  store.reconcileRevision = null;
}

async function runAtomicPhase<TPrepared>(
  store: RuntimeConfigAuthorityStore,
  snapshot: RuntimeConfigSnapshot,
  hooks: RuntimeConfigActivationHooks<TPrepared>
): Promise<AtomicPhaseResult> {
  const activeRevision = store.activeSnapshot?.revision ?? null;
  if (
    snapshot.revision < store.desiredRevision ||
    (activeRevision !== null && snapshot.revision < activeRevision)
  ) {
    return { snapshot: null, shouldReconcile: false };
  }

  if (activeRevision === snapshot.revision) {
    return {
      snapshot: store.activeSnapshot,
      shouldReconcile:
        store.state === "reconcile_pending" && store.reconcileRevision === snapshot.revision,
    };
  }

  const previous = store.activeSnapshot;
  const restartRequiredKeys = restartRequiredChanges(previous, snapshot);
  if (restartRequiredKeys.length > 0) {
    store.state = "ready";
    store.lastError = null;
    store.restartRequiredKeys = restartRequiredKeys;
    store.reconcileRevision = null;
    return { snapshot: null, shouldReconcile: false };
  }

  let prepared: TPrepared | undefined;
  try {
    prepared = await hooks.prepare?.(snapshot, previous);
    await hooks.applyAtomic?.(prepared, previous, snapshot);
  } catch (error) {
    try {
      await hooks.rollbackAtomic?.(prepared, previous, snapshot);
    } catch (rollbackError) {
      const combined = new Error(
        `Runtime config rollback failed after activation error (${errorMessage(error)}): ${errorMessage(rollbackError)}`
      );
      setActivationFailure(store, snapshot.revision, combined);
      throw combined;
    }
    setActivationFailure(store, snapshot.revision, error);
    throw error;
  }

  store.activeSnapshot = snapshot;
  store.state = "ready";
  store.lastError = null;
  store.restartRequiredKeys = [];
  store.reconcileRevision = hooks.reconcile ? snapshot.revision : null;
  return { snapshot, shouldReconcile: Boolean(hooks.reconcile) };
}

async function runReconcile(
  store: RuntimeConfigAuthorityStore,
  snapshot: RuntimeConfigSnapshot,
  reconcile: RuntimeConfigActivationHooks["reconcile"]
): Promise<void> {
  if (!reconcile) return;
  try {
    await reconcile(snapshot);
    if (
      store.activeSnapshot?.revision === snapshot.revision &&
      store.reconcileRevision === snapshot.revision
    ) {
      store.state = "ready";
      store.lastError = null;
      store.reconcileRevision = null;
    }
  } catch (error) {
    if (store.activeSnapshot?.revision === snapshot.revision) {
      store.state = "reconcile_pending";
      store.lastError = { revision: snapshot.revision, message: errorMessage(error) };
      store.reconcileRevision = snapshot.revision;
    }
  }
}

export async function activateRuntimeConfigCandidate<TPrepared = unknown>(
  candidate: RuntimeConfigCandidate,
  hooks: RuntimeConfigActivationHooks<TPrepared>
): Promise<RuntimeConfigSnapshot | null> {
  if (!Number.isSafeInteger(candidate.revision) || candidate.revision < 0) {
    throw new TypeError("Runtime config revision must be a non-negative safe integer");
  }

  const store = getStore();
  store.desiredRevision = Math.max(store.desiredRevision, candidate.revision);
  const snapshot = freezeCandidate(candidate);

  const activateAndReconcile = async () => {
    const result = await runAtomicPhase(store, snapshot, hooks);
    if (result.snapshot && result.shouldReconcile) {
      await runReconcile(store, result.snapshot, hooks.reconcile);
    }
    return result;
  };
  const activation = store.activationTail.then(activateAndReconcile, activateAndReconcile);
  store.activationTail = activation.then(
    () => undefined,
    () => undefined
  );

  return (await activation).snapshot;
}

export function getActiveRuntimeConfigSnapshot(): RuntimeConfigSnapshot | null {
  return getStore().activeSnapshot;
}

export function getRuntimeConfigStatus(): RuntimeConfigStatus {
  const store = getStore();
  return {
    desiredRevision: store.desiredRevision,
    activeRevision: store.activeSnapshot?.revision ?? null,
    state: store.state,
    lastError: store.lastError ? { ...store.lastError } : null,
    restartRequiredKeys: [...store.restartRequiredKeys],
    reconcileRevision: store.reconcileRevision,
  };
}

export function resetRuntimeConfigAuthorityForTests(): void {
  authorityGlobal[AUTHORITY_GLOBAL_KEY] = newStore();
}
