import assert from "node:assert/strict";
import test from "node:test";

import { createSelectiveMigrationRuntime } from "../../src/lib/migration/selectiveRuntime.ts";

test("TC-MIG-RUNTIME-034 target snapshot uses non-secret provider projection", async () => {
  const projections: string[][] = [];
  const runtime = createSelectiveMigrationRuntime({
    getProviderConnections: async (_filter, _limit, _offset, columns) => {
      projections.push(columns ?? []);
      return [
        {
          id: "target-conn",
          provider: "openai",
          authType: "oauth",
          name: "Primary",
          email: "owner@example.invalid",
        },
      ];
    },
    getProviderNodes: async () => [
      {
        id: "target-node",
        type: "openai",
        name: "Custom",
        baseUrl: "https://api.example.invalid",
      },
    ],
    getCombos: async () => [{ id: "target-combo", name: "Fallback" }],
    backupDbFile: () => ({ filename: "db_manual.sqlite", size: 8192 }),
    listDbBackups: async () => [],
    restoreDbBackup: async () => ({ restored: true }),
    createProviderConnection: async (data) => ({ ...data, id: "created-conn" }),
    createProviderNode: async (data) => ({ ...data, id: "created-node" }),
    createCombo: async (data) => ({ ...data, id: "created-combo" }),
    updateSettings: async (data) => data,
  });

  const target = await runtime.readTargetEntities();

  assert.deepEqual(projections, [["id", "provider", "auth_type", "name", "email"]]);
  assert.equal(projections[0]?.includes("api_key"), false);
  assert.equal(projections[0]?.includes("access_token"), false);
  assert.deepEqual(target, [
    {
      category: "providerConnections",
      targetId: "target-conn",
      identity: "openai|oauth|owner@example.invalid",
    },
    {
      category: "providerNodes",
      targetId: "target-node",
      identity: "openai|https://api.example.invalid",
    },
    {
      category: "combos",
      targetId: "target-combo",
      identity: "combo|fallback",
    },
  ]);
});

test("TC-MIG-RUNTIME-035 restore-point adapter waits for stable manual backup", async () => {
  let listCalls = 0;
  const runtime = createSelectiveMigrationRuntime({
    getProviderConnections: async () => [],
    getProviderNodes: async () => [],
    getCombos: async () => [],
    backupDbFile: (reason) => {
      assert.equal(reason, "manual");
      return { filename: "db_manual.sqlite", size: 8192 };
    },
    listDbBackups: async () => {
      listCalls += 1;
      return listCalls === 1
        ? []
        : [{ id: "db_manual.sqlite", filename: "db_manual.sqlite", size: 8192 }];
    },
    restoreDbBackup: async () => ({ restored: true }),
    createProviderConnection: async (data) => ({ ...data, id: "created-conn" }),
    createProviderNode: async (data) => ({ ...data, id: "created-node" }),
    createCombo: async (data) => ({ ...data, id: "created-combo" }),
    updateSettings: async (data) => data,
    sleep: async () => {},
  });

  const restorePoint = await runtime.applyDeps.createRestorePoint();

  assert.equal(restorePoint.id, "db_manual.sqlite");
  assert.ok(listCalls >= 3);
});

test("TC-MIG-RUNTIME-036 runtime delegates restore and domain writers without raw SQL", async () => {
  const events: string[] = [];
  const runtime = createSelectiveMigrationRuntime({
    getProviderConnections: async () => [],
    getProviderNodes: async () => [],
    getCombos: async () => [],
    backupDbFile: () => ({ filename: "db_manual.sqlite", size: 8192 }),
    listDbBackups: async () => [
      { id: "db_manual.sqlite", filename: "db_manual.sqlite", size: 8192 },
    ],
    restoreDbBackup: async (id) => {
      events.push("restore:" + id);
      return { restored: true };
    },
    createProviderConnection: async (data) => {
      events.push("connection");
      return { ...data, id: "created-conn" };
    },
    createProviderNode: async (data) => {
      events.push("node");
      return { ...data, id: "created-node" };
    },
    createCombo: async (data) => {
      events.push("combo");
      return { ...data, id: "created-combo" };
    },
    updateSettings: async (data) => {
      events.push("settings");
      return data;
    },
    sleep: async () => {},
  });

  await runtime.applyDeps.restoreRestorePoint("db_manual.sqlite");
  await runtime.applyDeps.createProviderConnection({ provider: "openai" });
  await runtime.applyDeps.createProviderNode({ type: "openai" });
  await runtime.applyDeps.createCombo({ name: "Fallback" });
  await runtime.applyDeps.updateSettings({ comboStrategy: "fallback" });

  assert.deepEqual(events, [
    "restore:db_manual.sqlite",
    "connection",
    "node",
    "combo",
    "settings",
  ]);
});

test("TC-MIG-RUNTIME-053 runtime reads user-owned aliases/pricing and delegates their writers", async () => {
  const events: string[] = [];
  const runtime = createSelectiveMigrationRuntime({
    getProviderConnections: async () => [],
    getProviderNodes: async () => [],
    getCombos: async () => [],
    getModelAliases: async () => ({ fast: "openai/gpt-target" }),
    getPricingWithSources: async () => ({
      pricing: {
        openai: {
          "gpt-example": { input: 9, output: 9 },
          "default-model": { input: 3, output: 4 },
        },
      },
      sourceMap: {
        openai: {
          "gpt-example": "user",
          "default-model": "default",
        },
      },
    }),
    backupDbFile: () => ({ filename: "db_manual.sqlite", size: 8192 }),
    listDbBackups: async () => [],
    restoreDbBackup: async () => ({ restored: true }),
    createProviderConnection: async (data) => ({ ...data, id: "created-conn" }),
    createProviderNode: async (data) => ({ ...data, id: "created-node" }),
    createCombo: async (data) => ({ ...data, id: "created-combo" }),
    updateSettings: async (data) => data,
    setModelAlias: async (alias, model) => {
      events.push("alias:" + alias + "=" + String(model));
    },
    updatePricing: async (pricing) => {
      events.push("pricing:" + JSON.stringify(pricing));
      return pricing;
    },
  });

  const target = await runtime.readTargetEntities();
  assert.deepEqual(target, [
    {
      category: "modelAliases",
      targetId: "modelAlias:fast",
      identity: "model-alias|fast",
    },
    {
      category: "pricing",
      targetId: "pricing:openai:gpt-example",
      identity: "pricing|openai|gpt-example",
    },
  ]);

  await runtime.applyDeps.setModelAlias?.("new-alias", "openai/gpt-example");
  await runtime.applyDeps.updatePricing?.({
    openai: { "gpt-example": { input: 1, output: 2 } },
  });

  assert.deepEqual(events, [
    "alias:new-alias=openai/gpt-example",
    'pricing:{"openai":{"gpt-example":{"input":1,"output":2}}}',
  ]);
});
