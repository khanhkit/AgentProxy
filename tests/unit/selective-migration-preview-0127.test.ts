import assert from "node:assert/strict";
import test from "node:test";

import {
  previewJsonMigrationSource,
  previewSqliteMigrationSource,
} from "../../src/lib/migration/selectivePreview.ts";

test("TC-MIG-PREVIEW-001 previews 9Router JSON without importing runtime state", () => {
  const plan = previewJsonMigrationSource({
    _meta: { source: "9router", version: "0.5.x" },
    providerConnections: [
      { id: "c1", provider: "openai", name: "Primary", apiKey: "secret-a" },
      { id: "c2", provider: "gemini", name: "Needs login" },
    ],
    providerNodes: [{ id: "n1", name: "Custom", baseUrl: "https://example.test" }],
    combos: [{ id: "combo-1", name: "Fast" }],
    apiKeys: [{ id: "k1", name: "redacted", credentialState: "redacted-non-restorable" }],
    settings: { theme: "dark" },
    usageHistory: [{ id: "u1" }],
  });

  assert.equal(plan.source.family, "9router");
  assert.equal(plan.source.format, "json");
  assert.equal(plan.inventory.providerConnections.length, 2);
  assert.equal(plan.inventory.providerNodes.length, 1);
  assert.equal(plan.inventory.combos.length, 1);
  assert.equal(plan.inventory.apiKeys.length, 1);
  assert.equal(plan.inventory.settings.length, 1);
  assert.ok(plan.inventory.providerConnections.some((item) => item.disposition === "REQUIRES_REAUTH"));
  assert.ok(plan.inventory.apiKeys.every((item) => item.disposition === "REQUIRES_REAUTH"));
  assert.deepEqual(plan.unsupported.map((entry) => entry.category), ["usageHistory"]);
});

test("TC-MIG-PREVIEW-002 previews OmniRoute SQLite through SELECT-only adapter access", () => {
  const tables = [
    "provider_connections",
    "provider_nodes",
    "combos",
    "api_keys",
    "usage_history",
    "quota_snapshots",
  ];
  const counts: Record<string, number> = {
    provider_connections: 3,
    provider_nodes: 2,
    combos: 4,
    api_keys: 2,
    usage_history: 99,
    quota_snapshots: 7,
  };
  const sqlSeen: string[] = [];
  const adapter = {
    prepare(sql: string) {
      sqlSeen.push(sql);
      if (sql.includes("sqlite_master")) return { all: () => tables.map((name) => ({ name })) };
      const match = sql.match(/FROM\s+([a-z_]+)/i);
      const table = match?.[1] ?? "";
      return { get: () => ({ count: counts[table] ?? 0 }) };
    },
  };

  const plan = previewSqliteMigrationSource(adapter);

  assert.equal(plan.source.family, "omniroute");
  assert.equal(plan.source.format, "sqlite");
  assert.equal(plan.inventory.providerConnections.length, 3);
  assert.equal(plan.inventory.providerNodes.length, 2);
  assert.equal(plan.inventory.combos.length, 4);
  assert.equal(plan.inventory.apiKeys.length, 2);
  assert.deepEqual(
    plan.unsupported.map((entry) => entry.category).sort(),
    ["quota_snapshots", "usage_history"]
  );
  assert.ok(sqlSeen.every((sql) => /^SELECT\b/i.test(sql.trim())));
});

test("TC-MIG-PREVIEW-003 rejects unrelated JSON and SQLite sources", () => {
  assert.throws(() => previewJsonMigrationSource({ hello: "world" }), /unsupported/i);
  assert.throws(
    () =>
      previewSqliteMigrationSource({
        prepare() {
          return { all: () => [{ name: "totally_unrelated" }] };
        },
      }),
    /unsupported/i
  );
});

test("TC-MIG-PREVIEW-009 detects current 9Router SQLite table naming without reading target state", () => {
  const tables = [
    "providerConnections",
    "providerNodes",
    "combos",
    "apiKeys",
    "usageHistory",
    "requestDetails",
  ];
  const counts: Record<string, number> = {
    providerConnections: 2,
    providerNodes: 3,
    combos: 1,
    apiKeys: 4,
    usageHistory: 12,
    requestDetails: 7,
  };
  const sqlSeen: string[] = [];
  const adapter = {
    prepare(sql: string) {
      sqlSeen.push(sql);
      if (sql.includes("sqlite_master")) {
        return { all: () => tables.map((name) => ({ name })) };
      }
      const match = sql.match(/FROM\s+([A-Za-z_]+)/);
      const table = match?.[1] ?? "";
      return { get: () => ({ count: counts[table] ?? 0 }) };
    },
  };

  const plan = previewSqliteMigrationSource(adapter);

  assert.equal(plan.source.family, "9router");
  assert.equal(plan.source.format, "sqlite");
  assert.equal(plan.inventory.providerConnections.length, 2);
  assert.equal(plan.inventory.providerNodes.length, 3);
  assert.equal(plan.inventory.combos.length, 1);
  assert.equal(plan.inventory.apiKeys.length, 4);
  assert.deepEqual(
    plan.unsupported.map((entry) => entry.category).sort(),
    ["requestDetails", "usageHistory"]
  );
  assert.ok(sqlSeen.every((sql) => /^SELECT\b/i.test(sql.trim())));
});

test("TC-MIG-PREVIEW-045 deferred portable families are reported explicitly instead of silently dropped", () => {
  const plan = previewJsonMigrationSource({
    _meta: { source: "9router", version: "0.5.86" },
    providerConnections: [{ id: "c1", provider: "openai", name: "Primary" }],
    modelAliases: { fast: "openai/gpt-example" },
    customModels: [{ providerAlias: "openai", id: "custom-1" }],
    pricing: { openai: { "gpt-example": { input: 1, output: 2 } } },
    proxyConfig: { global: "http://host-specific.invalid:3128" },
    mitmAlias: { cursor: { "gpt-example": "other-model" } },
  });

  assert.deepEqual(
    plan.unsupported.map((entry) => entry.category).sort(),
    ["customModels", "mitmAlias", "proxyConfig"]
  );
});

test("TC-MIG-PREVIEW-054 SQLite deferred KV scopes are reported unsupported", () => {
  const adapter = {
    prepare(sql: string) {
      if (sql.includes("sqlite_master")) {
        return {
          all: () =>
            ["providerConnections", "providerNodes", "combos", "apiKeys", "kv"].map(
              (name) => ({ name })
            ),
        };
      }
      if (/COUNT\(\*\).*FROM\s+kv.*customModels/i.test(sql)) {
        return { get: () => ({ count: 2 }) };
      }
      if (/COUNT\(\*\).*FROM\s+kv.*mitmAlias/i.test(sql)) {
        return { get: () => ({ count: 1 }) };
      }
      if (/COUNT\(\*\).*FROM\s+kv.*proxyConfig/i.test(sql)) {
        return { get: () => ({ count: 0 }) };
      }
      return { get: () => ({ count: 0 }) };
    },
  };

  const plan = previewSqliteMigrationSource(adapter);
  assert.deepEqual(
    plan.unsupported.map((entry) => [entry.category, entry.count]),
    [
      ["customModels", 2],
      ["mitmAlias", 1],
    ]
  );
});
