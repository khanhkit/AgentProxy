export const LIFECYCLE_PHASES = [
  "STOP_ADMISSION",
  "STOP_SCHEDULERS",
  "DRAIN_ACTIVE",
  "DRAIN_BACKGROUND",
  "FLUSH_DURABLE",
  "CLOSE_RESOURCES",
  "STOP_CHILDREN",
] as const;

export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];

export interface LifecycleHook {
  name: string;
  phase: LifecyclePhase;
  run: () => void | Promise<void>;
}

export type LifecycleHookStatus = "ok" | "rejected" | "timed_out" | "skipped_deadline";

export interface LifecycleHookResult {
  name: string;
  phase: LifecyclePhase;
  status: LifecycleHookStatus;
  error?: string;
}

export interface LifecycleShutdownReport {
  clean: boolean;
  timeoutMs: number;
  elapsedMs: number;
  results: LifecycleHookResult[];
}

interface LifecycleCoordinatorState {
  hooks: Map<string, LifecycleHook>;
}

declare global {
  // Process-global so Next HMR / duplicate module instances share one hook authority.
  var __agentproxyLifecycleCoordinator: LifecycleCoordinatorState | undefined;
}

function getState(): LifecycleCoordinatorState {
  globalThis.__agentproxyLifecycleCoordinator ??= { hooks: new Map() };
  return globalThis.__agentproxyLifecycleCoordinator;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerLifecycleHook(hook: LifecycleHook): () => void {
  if (!hook.name.trim()) throw new Error("Lifecycle hook name must not be empty");
  const state = getState();
  state.hooks.set(hook.name, hook);

  return () => {
    if (state.hooks.get(hook.name) === hook) state.hooks.delete(hook.name);
  };
}

async function runHook(hook: LifecycleHook, deadline: number): Promise<LifecycleHookResult> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    return { name: hook.name, phase: hook.phase, status: "skipped_deadline" };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<LifecycleHookResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({ name: hook.name, phase: hook.phase, status: "timed_out" });
    }, remainingMs);
    timer.unref?.();
  });

  const execution = Promise.resolve()
    .then(() => hook.run())
    .then<LifecycleHookResult, LifecycleHookResult>(
      () => ({ name: hook.name, phase: hook.phase, status: "ok" }),
      (error: unknown) => ({
        name: hook.name,
        phase: hook.phase,
        status: "rejected",
        error: errorMessage(error),
      })
    );

  try {
    return await Promise.race([execution, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runLifecycleShutdown(options: {
  timeoutMs: number;
}): Promise<LifecycleShutdownReport> {
  const timeoutMs = Math.max(0, options.timeoutMs);
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  const hooks = Array.from(getState().hooks.values());
  const results: LifecycleHookResult[] = [];
  let deadlineExhausted = timeoutMs === 0;

  for (const phase of LIFECYCLE_PHASES) {
    const phaseHooks = hooks.filter((hook) => hook.phase === phase);
    if (phaseHooks.length === 0) continue;

    if (deadlineExhausted || Date.now() >= deadline) {
      results.push(
        ...phaseHooks.map((hook) => ({
          name: hook.name,
          phase: hook.phase,
          status: "skipped_deadline" as const,
        }))
      );
      continue;
    }

    const phaseResults = await Promise.all(phaseHooks.map((hook) => runHook(hook, deadline)));
    results.push(...phaseResults);
    if (
      phaseResults.some(
        (result) => result.status === "timed_out" || result.status === "skipped_deadline"
      )
    ) {
      deadlineExhausted = true;
    }
  }

  return {
    clean: results.every((result) => result.status === "ok"),
    timeoutMs,
    elapsedMs: Date.now() - startedAt,
    results,
  };
}

export function __getLifecycleHooksForTests(): LifecycleHook[] {
  return Array.from(getState().hooks.values());
}

export function __resetLifecycleCoordinatorForTests(): void {
  delete globalThis.__agentproxyLifecycleCoordinator;
}
