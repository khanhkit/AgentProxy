import { isDraining } from "@/lib/shutdownState";

interface LifecycleBackgroundTaskState {
  tasks: Map<Promise<unknown>, string>;
}

declare global {
  var __agentproxyLifecycleBackgroundTasks: LifecycleBackgroundTaskState | undefined;
}

function getState(): LifecycleBackgroundTaskState {
  globalThis.__agentproxyLifecycleBackgroundTasks ??= { tasks: new Map() };
  return globalThis.__agentproxyLifecycleBackgroundTasks;
}

/**
 * Track process-owned background work that must settle before durable resources
 * close. Callers stay responsible for logging/recovering their own failures.
 */
export function trackLifecycleBackgroundTask<T>(name: string, promise: Promise<T>): Promise<T>;
export function trackLifecycleBackgroundTask<T>(
  name: string,
  task: () => Promise<T>
): Promise<T> | undefined;
export function trackLifecycleBackgroundTask<T>(
  name: string,
  work: Promise<T> | (() => Promise<T>)
): Promise<T> | undefined {
  if (typeof work === "function" && isDraining()) return undefined;

  const promise = typeof work === "function" ? work() : work;
  const state = getState();
  state.tasks.set(promise, name);
  void promise.then(
    () => state.tasks.delete(promise),
    () => state.tasks.delete(promise)
  );
  return promise;
}

/** Wait for all work admitted before scheduler shutdown to settle. */
export async function drainLifecycleBackgroundTasks(): Promise<void> {
  const state = getState();
  while (state.tasks.size > 0) {
    await Promise.allSettled([...state.tasks.keys()]);
  }
}

export function __getLifecycleBackgroundTaskCountForTests(): number {
  return getState().tasks.size;
}

export function __resetLifecycleBackgroundTasksForTests(): void {
  delete globalThis.__agentproxyLifecycleBackgroundTasks;
}
