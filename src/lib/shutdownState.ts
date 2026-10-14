/**
 * Dependency-light process shutdown state shared with request hot paths.
 *
 * Keep lifecycle composition out of this module: request admission/authz import
 * it on every server bundle, while the heavy shutdown hook graph belongs only to
 * the main startup/shutdown path.
 */

declare global {
  var __agentproxyShutdown:
    | {
        init: boolean;
        shuttingDown: boolean;
        activeRequests: number;
        shutdownPromise?: Promise<unknown>;
      }
    | undefined;
}

export function getShutdownState() {
  if (!globalThis.__agentproxyShutdown) {
    globalThis.__agentproxyShutdown = { init: false, shuttingDown: false, activeRequests: 0 };
  }
  return globalThis.__agentproxyShutdown;
}

export function isDraining(): boolean {
  return getShutdownState().shuttingDown;
}

export function trackRequest(): () => void {
  const state = getShutdownState();
  state.activeRequests++;
  let called = false;
  return () => {
    if (!called) {
      called = true;
      state.activeRequests--;
    }
  };
}

export function getActiveRequestCount(): number {
  return getShutdownState().activeRequests;
}
