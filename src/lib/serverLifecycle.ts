export type ServerLifecyclePhase = "starting" | "ready" | "stopping";

declare global {
  var __agentproxyServerLifecycle: ServerLifecyclePhase | undefined;
}

export function getServerLifecyclePhase(): ServerLifecyclePhase {
  return globalThis.__agentproxyServerLifecycle ?? "starting";
}

export function markServerStarting(): void {
  globalThis.__agentproxyServerLifecycle = "starting";
}

export function markServerReady(): void {
  if (getServerLifecyclePhase() !== "stopping") {
    globalThis.__agentproxyServerLifecycle = "ready";
  }
}

export function markServerStopping(): void {
  globalThis.__agentproxyServerLifecycle = "stopping";
}
