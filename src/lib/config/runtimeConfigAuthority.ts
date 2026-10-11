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

  const atomicPhase = store.activationTail.then(
    () => runAtomicPhase(store, snapshot, hooks),
    () => runAtomicPhase(store, snapshot, hooks)
  );
  store.activationTail = atomicPhase.then(
    () => undefined,
    () => undefined
  );

  const result = await atomicPhase;
  if (result.snapshot && result.shouldReconcile) {
    await runReconcile(store, result.snapshot, hooks.reconcile);
  }
  return result.snapshot;
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
