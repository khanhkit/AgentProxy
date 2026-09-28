import test from "node:test";
import assert from "node:assert/strict";
import {
  AgentProxyPlugin,
  AGENTPROXY_PROVIDER_KEY,
  DEFAULT_MODEL_CACHE_TTL_MS,
  resolveAgentProxyPluginOptions,
} from "../src/index.js";

test("scaffold: exports public surface", () => {
  assert.equal(
    typeof AgentProxyPlugin,
    "function",
    "AgentProxyPlugin must be a function (Plugin factory)"
  );
  assert.equal(AGENTPROXY_PROVIDER_KEY, "agentproxy");
  assert.equal(DEFAULT_MODEL_CACHE_TTL_MS, 300_000);
});

test("scaffold: default export is v1 plugin shape { id, server: AgentProxyPlugin }", async () => {
  const mod = await import("../src/index.js");
  assert.equal(typeof mod.default, "object");
  assert.equal(mod.default.id, "@agentproxy/opencode-plugin");
  assert.equal(mod.default.server, mod.AgentProxyPlugin);
});

test("resolveAgentProxyPluginOptions: defaults", () => {
  const r = resolveAgentProxyPluginOptions();
  assert.equal(r.providerId, "opencode-agentproxy");
  assert.equal(r.displayName, "AgentProxy");
  assert.equal(r.modelCacheTtl, 300_000);
  assert.equal(r.baseURL, undefined);
});

test("resolveAgentProxyPluginOptions: custom providerId derives displayName", () => {
  const r = resolveAgentProxyPluginOptions({ providerId: "agentproxy-preprod" });
  assert.equal(r.providerId, "opencode-agentproxy-preprod");
  assert.equal(r.displayName, "AgentProxy (opencode-agentproxy-preprod)");
});

test("resolveAgentProxyPluginOptions: explicit displayName wins", () => {
  const r = resolveAgentProxyPluginOptions({
    providerId: "agentproxy-x",
    displayName: "Custom Label",
  });
  assert.equal(r.displayName, "Custom Label");
});

test("resolveAgentProxyPluginOptions: invalid TTL falls back to default", () => {
  assert.equal(resolveAgentProxyPluginOptions({ modelCacheTtl: 0 }).modelCacheTtl, 300_000);
  assert.equal(resolveAgentProxyPluginOptions({ modelCacheTtl: -1 }).modelCacheTtl, 300_000);
});

test("resolveAgentProxyPluginOptions: positive TTL respected", () => {
  assert.equal(resolveAgentProxyPluginOptions({ modelCacheTtl: 60_000 }).modelCacheTtl, 60_000);
});

test("AgentProxyPlugin: returns an empty hooks object (scaffold)", async () => {
  const fakeCtx = {} as Parameters<typeof AgentProxyPlugin>[0];
  const hooks = await AgentProxyPlugin(fakeCtx);
  assert.equal(typeof hooks, "object");
  assert.notEqual(hooks, null);
});

test("scaffold: built ESM default export resolves with the v1 plugin shape", async () => {
  // The plugin is ESM-only now — the CJS bundle was dropped to fix the OpenCode
  // loader (#3883), so there is no more ../dist/index.cjs. Validate that the built
  // distributable's default export still carries the OpenCode v1 { id, server } shape.
  const mod = await import("../dist/index.js");
  assert.strictEqual(typeof mod.default, "object");
  assert.strictEqual(mod.default.id, "@agentproxy/opencode-plugin");
  assert.strictEqual(typeof mod.default.server, "function");
});
