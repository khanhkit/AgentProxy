import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSelectiveMigrationPlan,
  type MigrationSourceEntity,
} from "../../src/lib/migration/selectivePlan.ts";

const entities: MigrationSourceEntity[] = [
  {
    category: "providerConnections",
    sourceId: "source-conn-1",
    identity: "openai:primary",
    label: "Primary OpenAI",
    disposition: "CREATE",
  },
  {
    category: "combos",
    sourceId: "source-combo-1",
    identity: "combo:fast",
    label: "Fast",
    disposition: "CREATE",
    dependencies: [{ category: "providerConnections", sourceId: "source-conn-1" }],
  },
  {
    category: "apiKeys",
    sourceId: "source-key-1",
    identity: "key:legacy",
    label: "Legacy key",
    disposition: "REQUIRES_REAUTH",
    dependencies: [{ category: "combos", sourceId: "source-combo-1" }],
  },
];

test("TC-MIG-PLAN-010 reports unresolved dependency for partial selection", () => {
  const plan = buildSelectiveMigrationPlan({
    entities,
    selected: [{ category: "combos", sourceId: "source-combo-1" }],
    target: [],
  });

  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0]?.disposition, "CONFLICT");
  assert.deepEqual(plan.items[0]?.unresolvedDependencies, [
    { category: "providerConnections", sourceId: "source-conn-1" },
  ]);
  assert.equal(plan.canApply, false);
});

test("TC-MIG-PLAN-011 selected dependency is planned without trusting source ids", () => {
  const plan = buildSelectiveMigrationPlan({
    entities,
    selected: [
      { category: "providerConnections", sourceId: "source-conn-1" },
      { category: "combos", sourceId: "source-combo-1" },
    ],
    target: [],
  });

  assert.equal(plan.canApply, true);
  assert.equal(plan.idMap["providerConnections:source-conn-1"], null);
  assert.equal(plan.idMap["combos:source-combo-1"], null);
  assert.notEqual(plan.items[0]?.targetId, "source-conn-1");
  assert.notEqual(plan.items[1]?.targetId, "source-combo-1");
});

test("TC-MIG-PLAN-012 matching target defaults to KEEP_TARGET and maps old id", () => {
  const plan = buildSelectiveMigrationPlan({
    entities,
    selected: [{ category: "providerConnections", sourceId: "source-conn-1" }],
    target: [
      {
        category: "providerConnections",
        targetId: "target-connection-9",
        identity: "openai:primary",
      },
    ],
  });

  assert.equal(plan.items[0]?.disposition, "KEEP_TARGET");
  assert.equal(plan.items[0]?.targetId, "target-connection-9");
  assert.equal(
    plan.idMap["providerConnections:source-conn-1"],
    "target-connection-9"
  );
  assert.equal(plan.canApply, true);
});

test("TC-MIG-PLAN-013 dependency can resolve through existing target identity", () => {
  const plan = buildSelectiveMigrationPlan({
    entities,
    selected: [{ category: "combos", sourceId: "source-combo-1" }],
    target: [
      {
        category: "providerConnections",
        targetId: "target-connection-9",
        identity: "openai:primary",
      },
    ],
  });

  assert.equal(plan.items[0]?.disposition, "CREATE");
  assert.deepEqual(plan.items[0]?.unresolvedDependencies, []);
  assert.equal(
    plan.idMap["providerConnections:source-conn-1"],
    "target-connection-9"
  );
  assert.equal(plan.canApply, true);
});

test("TC-MIG-PLAN-014 credential disposition remains REQUIRES_REAUTH", () => {
  const plan = buildSelectiveMigrationPlan({
    entities,
    selected: [
      { category: "providerConnections", sourceId: "source-conn-1" },
      { category: "combos", sourceId: "source-combo-1" },
      { category: "apiKeys", sourceId: "source-key-1" },
    ],
    target: [],
  });

  const key = plan.items.find((item) => item.sourceId === "source-key-1");
  assert.equal(key?.disposition, "REQUIRES_REAUTH");
  assert.equal(plan.canApply, true);
});

test("TC-MIG-PLAN-015 unsupported selected entity fails closed", () => {
  const plan = buildSelectiveMigrationPlan({
    entities: [
      {
        category: "settings",
        sourceId: "runtime-only",
        identity: "runtime-only",
        label: "Runtime state",
        disposition: "UNSUPPORTED",
      },
    ],
    selected: [{ category: "settings", sourceId: "runtime-only" }],
    target: [],
  });

  assert.equal(plan.items[0]?.disposition, "UNSUPPORTED");
  assert.equal(plan.canApply, false);
});
