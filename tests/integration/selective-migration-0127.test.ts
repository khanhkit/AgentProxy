import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  normalize9RouterJsonSource,
  normalizeOmniRouteSqliteRows,
} from "../../src/lib/migration/selectiveNormalize.ts";
import { buildSelectiveMigrationPlan } from "../../src/lib/migration/selectivePlan.ts";
import { normalizeTargetEntities } from "../../src/lib/migration/selectiveTarget.ts";
import {
  applySelectiveMigrationPlan,
  SelectiveMigrationApplyError,
} from "../../src/lib/migration/selectiveApply.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(here, "../fixtures/selective-migration");

function fixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
}

function applyDeps(events: string[], failCombo = false) {
  return {
    createRestorePoint: async () => {
      events.push("restore-point");
      return { id: "db_fixture_manual.sqlite" };
    },
    restoreRestorePoint: async (id: string) => {
      events.push("restore:" + id);
    },
    createProviderConnection: async (data: Record<string, unknown>) => {
      events.push("connection:" + JSON.stringify(data));
      return { ...data, id: "target-conn-created" };
    },
    createProviderNode: async (data: Record<string, unknown>) => ({
      ...data,
      id: "target-node-created",
    }),
    createCombo: async (data: Record<string, unknown>) => {
      events.push("combo:" + JSON.stringify(data));
      if (failCombo) throw new Error("fixture combo failure");
      return { ...data, id: "target-combo-created" };
    },
    updateSettings: async (data: Record<string, unknown>) => data,
  };
}

test("TC-MIG-INT-046 pinned 9Router JSON fixture applies selected items with reauth and remap", async () => {
  const entities = normalize9RouterJsonSource(
    fixture("9router-v0.5.86-legacy.json")
  );
  const selected = [
    { category: "providerConnections" as const, sourceId: "9r-conn-1" },
    { category: "combos" as const, sourceId: "9r-combo-1" },
    { category: "apiKeys" as const, sourceId: "9r-key-1" },
  ];
  const plan = buildSelectiveMigrationPlan({ entities, selected, target: [] });
  assert.equal(plan.canApply, true);

  const events: string[] = [];
  const result = await applySelectiveMigrationPlan(plan, applyDeps(events));

  assert.equal(
    result.idMap["providerConnections:9r-conn-1"],
    "target-conn-created"
  );
  assert.equal(
    result.idMap["combos:9r-combo-1"],
    "target-combo-created"
  );
  assert.equal(
    result.items.find((item) => item.sourceId === "9r-key-1")?.status,
    "REQUIRES_REAUTH"
  );
  const connectionEvent = events.find((event) => event.startsWith("connection:")) ?? "";
  assert.equal(connectionEvent.includes("fixture-secret"), false);
  assert.match(connectionEvent, /"isActive":false/);
  const comboEvent = events.find((event) => event.startsWith("combo:")) ?? "";
  assert.match(comboEvent, /"connectionId":"target-conn-created"/);
});

test("TC-MIG-INT-047 pinned OmniRoute fixture supports partial selection through existing target identity", async () => {
  const entities = normalizeOmniRouteSqliteRows(
    fixture("omniroute-v3.8.51-sqlite-rows.json")
  );
  const target = normalizeTargetEntities({
    providerConnections: [
      {
        id: "target-existing",
        provider: "openai",
        authType: "oauth",
        name: "Primary",
        email: "primary@example.invalid",
      },
    ],
  });

  const plan = buildSelectiveMigrationPlan({
    entities,
    selected: [{ category: "combos", sourceId: "omni-combo-1" }],
    target,
  });
  assert.equal(plan.canApply, true);
  assert.equal(
    plan.idMap["providerConnections:omni-conn-1"],
    "target-existing"
  );

  const events: string[] = [];
  await applySelectiveMigrationPlan(plan, applyDeps(events));

  assert.equal(events.some((event) => event.startsWith("connection:")), false);
  const comboEvent = events.find((event) => event.startsWith("combo:")) ?? "";
  assert.match(comboEvent, /"connectionId":"target-existing"/);
});

test("TC-MIG-INT-048 fixture apply failure restores the pre-migration restore point", async () => {
  const entities = normalize9RouterJsonSource(
    fixture("9router-v0.5.86-legacy.json")
  );
  const plan = buildSelectiveMigrationPlan({
    entities,
    selected: [
      { category: "providerConnections", sourceId: "9r-conn-1" },
      { category: "combos", sourceId: "9r-combo-1" },
    ],
    target: [],
  });

  const events: string[] = [];
  await assert.rejects(
    () => applySelectiveMigrationPlan(plan, applyDeps(events, true)),
    (error: unknown) => {
      assert.ok(error instanceof SelectiveMigrationApplyError);
      assert.equal(error.rolledBack, true);
      return true;
    }
  );
  assert.deepEqual(events.slice(-2), [
    "combo:" + JSON.stringify({
      name: "Fast",
      models: [{ model: "gpt-example", connectionId: "target-conn-created" }],
      kind: "fallback",
    }),
    "restore:db_fixture_manual.sqlite",
  ]);
});
