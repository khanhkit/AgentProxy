import assert from "node:assert/strict";
import test from "node:test";

import {
  applySelectiveMigrationPlan,
  SelectiveMigrationApplyError,
} from "../../src/lib/migration/selectiveApply.ts";
import type { SelectiveMigrationPlan } from "../../src/lib/migration/selectivePlan.ts";

function basePlan(): SelectiveMigrationPlan {
  return {
    canApply: true,
    idMap: {
      "providerConnections:source-conn-1": null,
      "combos:source-combo-1": null,
    },
    items: [
      {
        category: "providerConnections",
        sourceId: "source-conn-1",
        identity: "openai|oauth|owner@example.invalid",
        label: "Owner",
        disposition: "REQUIRES_REAUTH",
        unresolvedDependencies: [],
        data: {
          provider: "openai",
          authType: "oauth",
          name: "Owner",
          email: "owner@example.invalid",
          isActive: false,
        },
      },
      {
        category: "combos",
        sourceId: "source-combo-1",
        identity: "combo|fallback",
        label: "Fallback",
        disposition: "CREATE",
        dependencies: [
          { category: "providerConnections", sourceId: "source-conn-1" },
        ],
        unresolvedDependencies: [],
        data: {
          name: "Fallback",
          models: [{ model: "gpt-example", connectionId: "source-conn-1" }],
        },
      },
    ],
  };
}

function deps(events: string[]) {
  return {
    createRestorePoint: async () => {
      events.push("restore-point");
      return { id: "db_fixture_manual.sqlite" };
    },
    restoreRestorePoint: async (id: string) => {
      events.push("restore:" + id);
    },
    createProviderConnection: async (data: Record<string, unknown>) => {
      events.push("create-connection");
      return { ...data, id: "target-conn-9" };
    },
    createProviderNode: async (data: Record<string, unknown>) => {
      events.push("create-node");
      return { ...data, id: "target-node-9" };
    },
    createCombo: async (data: Record<string, unknown>) => {
      events.push("create-combo");
      return { ...data, id: "target-combo-9" };
    },
    updateSettings: async (data: Record<string, unknown>) => {
      events.push("update-settings");
      return data;
    },
  };
}

test("TC-MIG-APPLY-022 blocks a non-applicable plan before restore point or writes", async () => {
  const events: string[] = [];
  const plan = basePlan();
  plan.canApply = false;

  await assert.rejects(
    () => applySelectiveMigrationPlan(plan, deps(events)),
    /not applicable/i
  );
  assert.deepEqual(events, []);
});

test("TC-MIG-APPLY-023 awaits restore point before the first target mutation", async () => {
  const events: string[] = [];
  const result = await applySelectiveMigrationPlan(basePlan(), deps(events));

  assert.equal(result.restorePointId, "db_fixture_manual.sqlite");
  assert.deepEqual(events.slice(0, 2), ["restore-point", "create-connection"]);
  assert.equal(result.idMap["providerConnections:source-conn-1"], "target-conn-9");
});

test("TC-MIG-APPLY-024 remaps combo connection references to created target ids", async () => {
  const events: string[] = [];
  let comboPayload: Record<string, unknown> | null = null;
  const d = deps(events);
  d.createCombo = async (data: Record<string, unknown>) => {
    comboPayload = data;
    events.push("create-combo");
    return { ...data, id: "target-combo-9" };
  };

  const result = await applySelectiveMigrationPlan(basePlan(), d);

  assert.deepEqual(comboPayload, {
    name: "Fallback",
    models: [{ model: "gpt-example", connectionId: "target-conn-9" }],
  });
  assert.equal(result.idMap["combos:source-combo-1"], "target-combo-9");
});

test("TC-MIG-APPLY-025 KEEP_TARGET is never written", async () => {
  const events: string[] = [];
  const plan: SelectiveMigrationPlan = {
    canApply: true,
    idMap: { "providerConnections:source-existing": "target-existing" },
    items: [
      {
        category: "providerConnections",
        sourceId: "source-existing",
        identity: "openai|apikey|existing",
        label: "Existing",
        disposition: "KEEP_TARGET",
        targetId: "target-existing",
        unresolvedDependencies: [],
        data: { provider: "openai" },
      },
    ],
  };

  const result = await applySelectiveMigrationPlan(plan, deps(events));

  assert.equal(result.restorePointId, null);
  assert.deepEqual(events, []);
  assert.equal(result.idMap["providerConnections:source-existing"], "target-existing");
});

test("TC-MIG-APPLY-026 API-key REQUIRES_REAUTH is reported without creating target secret", async () => {
  const events: string[] = [];
  const plan: SelectiveMigrationPlan = {
    canApply: true,
    idMap: { "apiKeys:source-key": null },
    items: [
      {
        category: "apiKeys",
        sourceId: "source-key",
        identity: "api-key|legacy",
        label: "Legacy",
        disposition: "REQUIRES_REAUTH",
        unresolvedDependencies: [],
        data: { name: "Legacy", allowedModels: ["gpt-example"] },
      },
    ],
  };

  const result = await applySelectiveMigrationPlan(plan, deps(events));

  assert.equal(result.restorePointId, null);
  assert.deepEqual(events, []);
  assert.deepEqual(result.items, [
    {
      category: "apiKeys",
      sourceId: "source-key",
      status: "REQUIRES_REAUTH",
      targetId: null,
    },
  ]);
});

test("TC-MIG-APPLY-027 writer failure restores the pre-migration restore point", async () => {
  const events: string[] = [];
  const d = deps(events);
  d.createCombo = async () => {
    events.push("create-combo");
    throw new Error("fixture combo failure");
  };

  await assert.rejects(
    () => applySelectiveMigrationPlan(basePlan(), d),
    (error: unknown) => {
      assert.ok(error instanceof SelectiveMigrationApplyError);
      assert.equal(error.restorePointId, "db_fixture_manual.sqlite");
      assert.equal(error.rolledBack, true);
      assert.match(error.message, /fixture combo failure/);
      return true;
    }
  );

  assert.deepEqual(events, [
    "restore-point",
    "create-connection",
    "create-combo",
    "restore:db_fixture_manual.sqlite",
  ]);
});
