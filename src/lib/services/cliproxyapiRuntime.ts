export async function clearCliproxyapiRuntimeCache(): Promise<void> {
  const { clearCliproxyapiUrlCache } =
    await import("@agentproxy/open-sse/executors/cliproxyapi.ts");
  clearCliproxyapiUrlCache();
}
