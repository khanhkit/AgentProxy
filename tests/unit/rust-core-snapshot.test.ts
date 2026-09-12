import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCodexConnectionConfigs,
  createRustCoreSnapshotVersioner,
} from "../../src/lib/rustCore/snapshotBuilder";

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: "codex-a",
    provider: "codex",
    isActive: true,
    accessToken: "secret-access",
    refreshToken: "must-not-export",
    idToken: "must-not-export-either",
    rateLimitedUntil: null,
    maxConcurrent: 4,
    updatedAt: "2026-09-12T00:00:00.000Z",
    providerSpecificData: {
      workspaceId: "workspace-a",
    },
    ...overrides,
  };
}

describe("buildCodexConnectionConfigs", () => {
  it("exports only eligible Codex runtime credentials and metadata", () => {
    const now = Date.parse("2026-09-12T01:00:00.000Z");
    const result = buildCodexConnectionConfigs(
      [
        connection(),
        connection({ id: "inactive", isActive: false }),
        connection({ id: "no-token", accessToken: null }),
        connection({
          id: "limited",
          rateLimitedUntil: "2026-09-12T02:00:00.000Z",
        }),
        connection({ id: "other", provider: "claude" }),
      ],
      now
    );

    assert.deepEqual(result, [
      {
        id: "codex-a",
        access_token: "secret-access",
        workspace_id: "workspace-a",
        base_url: "https://chatgpt.com/backend-api/codex",
        max_concurrent: 4,
        credential_version: Date.parse("2026-09-12T00:00:00.000Z"),
      },
    ]);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes("must-not-export"), false);
    assert.equal(serialized.includes("refreshToken"), false);
    assert.equal(serialized.includes("idToken"), false);
  });

  it("re-admits an account after its persisted rate limit expires", () => {
    const row = connection({ rateLimitedUntil: "2026-09-12T02:00:00.000Z" });
    assert.equal(
      buildCodexConnectionConfigs([row], Date.parse("2026-09-12T01:59:59.000Z")).length,
      0
    );
    assert.equal(
      buildCodexConnectionConfigs([row], Date.parse("2026-09-12T02:00:00.001Z")).length,
      1
    );
  });
});

describe("createRustCoreSnapshotVersioner", () => {
  it("keeps generation stable until effective runtime config changes", () => {
    const versioner = createRustCoreSnapshotVersioner("node-a");
    const now = Date.parse("2026-09-12T01:00:00.000Z");

    const first = versioner.next([connection()], now);
    const same = versioner.next([connection()], now + 1_000);
    const changed = versioner.next(
      [connection({ accessToken: "rotated-access", updatedAt: "2026-09-12T01:01:00.000Z" })],
      now + 2_000
    );

    assert.equal(first.schema_version, 1);
    assert.equal(first.source_id, "node-a");
    assert.equal(first.generation, 1);
    assert.equal(same.generation, 1);
    assert.equal(changed.generation, 2);
    assert.equal(changed.codex_connections[0].access_token, "rotated-access");
  });

  it("uses a new source id to distinguish a restarted control plane", () => {
    const firstProcess = createRustCoreSnapshotVersioner("node-a");
    const restartedProcess = createRustCoreSnapshotVersioner("node-b");
    assert.equal(firstProcess.next([connection()]).source_id, "node-a");
    assert.equal(restartedProcess.next([connection()]).source_id, "node-b");
    assert.equal(restartedProcess.next([connection()]).generation, 1);
  });
});

function apiKey(overrides: Record<string, unknown> = {}) {
  return {
    id: "key-a",
    key: "omr-secret-key-a",
    keyHash: null,
    isActive: true,
    isBanned: false,
    revokedAt: null,
    expiresAt: null,
    modelAccessMode: "all",
    allowedModels: [],
    blockedModels: [],
    allowedCombos: ["combo/*"],
    allowedConnections: [],
    allowedQuotas: [],
    accessSchedule: null,
    rateLimits: null,
    maxRequestsPerDay: null,
    maxRequestsPerMinute: null,
    throttleDelayMs: null,
    maxSessions: 0,
    ipAllowlist: [],
    scopes: [],
    proxyId: null,
    allowedEndpoints: [],
    disableNonPublicModels: false,
    usageLimitEnabled: false,
    dailyUsageLimitUsd: null,
    weeklyUsageLimitUsd: null,
    ...overrides,
  };
}

describe("buildRustApiKeyConfigs", () => {
  it("exports hashes, never plaintext client API keys", async () => {
    const { buildRustApiKeyConfigs } = await import("../../src/lib/rustCore/snapshotBuilder");
    const configs = buildRustApiKeyConfigs([apiKey()], null, Date.parse("2026-09-12T01:00:00Z"));
    assert.equal(configs.length, 1);
    assert.equal(configs[0].id, "key-a");
    assert.match(configs[0].key_hash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(configs).includes("omr-secret-key-a"), false);
    assert.equal(configs[0].unsupported_policy, false);
  });

  it("filters inactive, banned, revoked, and expired keys", async () => {
    const { buildRustApiKeyConfigs } = await import("../../src/lib/rustCore/snapshotBuilder");
    const now = Date.parse("2026-09-12T01:00:00Z");
    const configs = buildRustApiKeyConfigs(
      [
        apiKey({ id: "inactive", isActive: false }),
        apiKey({ id: "banned", isBanned: true }),
        apiKey({ id: "revoked", revokedAt: "2026-09-11T00:00:00Z" }),
        apiKey({ id: "expired", expiresAt: "2026-09-12T00:59:00Z" }),
        apiKey({ id: "valid" }),
      ],
      null,
      now
    );
    assert.deepEqual(configs.map((item) => item.id), ["valid"]);
  });

  it("marks policy shapes Rust has not ported as unsupported instead of widening access", async () => {
    const { buildRustApiKeyConfigs } = await import("../../src/lib/rustCore/snapshotBuilder");
    for (const overrides of [
      { modelAccessMode: "restricted", allowedModels: ["gpt-5.6-sol"] },
      { rateLimits: [{ limit: 1, window: 60 }] },
      { allowedQuotas: ["quota-a"] },
      { scopes: ["lease:exclusive"], allowedConnections: ["codex-a"] },
      { accessSchedule: { enabled: true, from: "09:00", until: "17:00", tz: "UTC" } },
      { usageLimitEnabled: true, dailyUsageLimitUsd: 1 },
      { ipAllowlist: ["127.0.0.1"] },
      { proxyId: "proxy-a" },
    ]) {
      const [config] = buildRustApiKeyConfigs([apiKey(overrides)], null);
      assert.equal(config.unsupported_policy, true, JSON.stringify(overrides));
    }
  });

  it("exports endpoint and connection restrictions that Rust can enforce", async () => {
    const { buildRustApiKeyConfigs } = await import("../../src/lib/rustCore/snapshotBuilder");
    const [config] = buildRustApiKeyConfigs([
      apiKey({ allowedEndpoints: ["chat"], allowedConnections: ["codex-b"] }),
    ], null);
    assert.deepEqual(config.allowed_endpoints, ["chat"]);
    assert.deepEqual(config.allowed_connections, ["codex-b"]);
    assert.equal(config.unsupported_policy, false);
  });

  it("includes the deployment env API key as a hashed unrestricted key", async () => {
    const { buildRustApiKeyConfigs } = await import("../../src/lib/rustCore/snapshotBuilder");
    const configs = buildRustApiKeyConfigs([], "env-secret-key");
    assert.deepEqual(configs.map((item) => item.id), ["env-key"]);
    assert.match(configs[0].key_hash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(configs).includes("env-secret-key"), false);
    assert.equal(configs[0].unsupported_policy, false);
  });
});

describe("Rust core Codex model eligibility snapshot", () => {
  it("sorts/deduplicates model sets and bumps generation only when effective model routing changes", () => {
    const versioner = createRustCoreSnapshotVersioner("node-models");
    const first = versioner.next([], 1, [], null, ["gpt-b", "gpt-a", "gpt-a"], ["gpt-native"]);
    const same = versioner.next([], 2, [], null, ["gpt-a", "gpt-b"], ["gpt-native"]);
    const changed = versioner.next([], 3, [], null, ["gpt-a", "gpt-b", "gpt-c"], ["gpt-native"]);

    assert.deepEqual(first.codex_catalog_models, ["gpt-a", "gpt-b"]);
    assert.deepEqual(first.codex_native_models, ["gpt-native"]);
    assert.equal(first.generation, 1);
    assert.equal(same.generation, 1);
    assert.equal(changed.generation, 2);
  });
});
