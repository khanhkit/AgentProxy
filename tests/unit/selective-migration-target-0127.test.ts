import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTargetEntities } from "../../src/lib/migration/selectiveTarget.ts";

test("TC-MIG-TARGET-031 target connection identity matches source conflict identity without secrets", () => {
  const target = normalizeTargetEntities({
    providerConnections: [
      {
        id: "target-conn-1",
        provider: "openai",
        authType: "oauth",
        name: "Primary",
        email: "owner@example.invalid",
      },
    ],
  });

  assert.deepEqual(target, [
    {
      category: "providerConnections",
      targetId: "target-conn-1",
      identity: "openai|oauth|owner@example.invalid",
    },
  ]);
});

test("TC-MIG-TARGET-032 target node and combo identities are deterministic", () => {
  const target = normalizeTargetEntities({
    providerNodes: [
      {
        id: "target-node-1",
        type: "openai",
        name: "Custom",
        baseUrl: "https://api.example.invalid",
      },
    ],
    combos: [{ id: "target-combo-1", name: "Fallback" }],
  });

  assert.deepEqual(target, [
    {
      category: "providerNodes",
      targetId: "target-node-1",
      identity: "openai|https://api.example.invalid",
    },
    {
      category: "combos",
      targetId: "target-combo-1",
      identity: "combo|fallback",
    },
  ]);
});

test("TC-MIG-TARGET-033 malformed target rows are ignored rather than becoming conflicts", () => {
  const target = normalizeTargetEntities({
    providerConnections: [{ provider: "openai" }],
    providerNodes: [{ id: "", type: "openai", name: "broken" }],
    combos: [null, { id: "combo-ok", name: "" }],
  });

  assert.deepEqual(target, []);
});
