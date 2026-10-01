import assert from "node:assert/strict";
import test from "node:test";

import { handleSelectiveMigrationApplyRequest } from "../../src/lib/migration/selectiveApplyRequest.ts";

function sourceFile() {
  return new File(
    [
      JSON.stringify({
        _meta: { source: "9router", version: "0.5.86" },
        providerConnections: [
          {
            id: "source-conn-1",
            provider: "openai",
            authType: "oauth",
            name: "Owner",
            email: "owner@example.invalid",
            accessToken: "fixture-secret-must-not-leak",
          },
        ],
        combos: [
          {
            id: "source-combo-1",
            name: "Fallback",
            models: [{ model: "gpt-example", connectionId: "source-conn-1" }],
          },
        ],
      }),
    ],
    "db.json",
    { type: "application/json" }
  );
}

function request(selection: unknown, extra?: Record<string, string>) {
  const form = new FormData();
  form.set("file", sourceFile());
  form.set("selection", JSON.stringify(selection));
  for (const [key, value] of Object.entries(extra ?? {})) form.set(key, value);
  return new Request("http://localhost/api/settings/migration/apply", {
    method: "POST",
    body: form,
  });
}

function deps(events: string[] = []) {
  return {
    isAuthRequired: async () => true,
    isAuthenticated: async () => true,
    openDatabase: async () => {
      throw new Error("JSON source must not open SQLite");
    },
    readTargetEntities: async () => [],
    applyDeps: {
      createRestorePoint: async () => {
        events.push("restore-point");
        return { id: "db_fixture_manual.sqlite" };
      },
      restoreRestorePoint: async (id: string) => {
        events.push("restore:" + id);
      },
      createProviderConnection: async (data: Record<string, unknown>) => {
        events.push("connection:" + JSON.stringify(data));
        return { ...data, id: "target-conn-1" };
      },
      createProviderNode: async (data: Record<string, unknown>) => {
        events.push("node");
        return { ...data, id: "target-node-1" };
      },
      createCombo: async (data: Record<string, unknown>) => {
        events.push("combo:" + JSON.stringify(data));
        return { ...data, id: "target-combo-1" };
      },
      updateSettings: async (data: Record<string, unknown>) => {
        events.push("settings");
        return data;
      },
    },
  };
}

test("TC-MIG-APPLY-API-037 rejects unauthenticated requests before source or target reads", async () => {
  let targetRead = false;
  const d = deps();
  d.isAuthenticated = async () => false;
  d.readTargetEntities = async () => {
    targetRead = true;
    return [];
  };

  const response = await handleSelectiveMigrationApplyRequest(
    request([{ category: "providerConnections", sourceId: "source-conn-1" }]),
    d
  );

  assert.equal(response.status, 401);
  assert.equal(targetRead, false);
});

test("TC-MIG-APPLY-API-038 rejects malformed/unknown selection without mutation", async () => {
  const events: string[] = [];
  const d = deps(events);

  const malformed = await handleSelectiveMigrationApplyRequest(
    request([{ category: "providerConnections" }]),
    d
  );
  assert.equal(malformed.status, 400);

  const unknown = await handleSelectiveMigrationApplyRequest(
    request([{ category: "providerConnections", sourceId: "not-in-source" }]),
    d
  );
  assert.equal(unknown.status, 400);
  assert.deepEqual(events, []);
});

test("TC-MIG-APPLY-API-039 dependency conflict returns 409 with no restore point or writes", async () => {
  const events: string[] = [];
  const response = await handleSelectiveMigrationApplyRequest(
    request([{ category: "combos", sourceId: "source-combo-1" }]),
    deps(events)
  );

  assert.equal(response.status, 409);
  const payload = (await response.json()) as { plan?: { canApply?: boolean } };
  assert.equal(payload.plan?.canApply, false);
  assert.deepEqual(events, []);
});

test("TC-MIG-APPLY-API-040 server rebuilds plan from source and remaps selected data", async () => {
  const events: string[] = [];
  const response = await handleSelectiveMigrationApplyRequest(
    request(
      [
        { category: "providerConnections", sourceId: "source-conn-1" },
        { category: "combos", sourceId: "source-combo-1" },
      ],
      {
        plan: JSON.stringify({
          canApply: true,
          items: [{ data: { provider: "attacker-controlled" } }],
        }),
      }
    ),
    deps(events)
  );

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    result?: {
      idMap?: Record<string, string | null>;
      restorePointId?: string | null;
    };
  };
  assert.equal(payload.result?.restorePointId, "db_fixture_manual.sqlite");
  assert.equal(
    payload.result?.idMap?.["providerConnections:source-conn-1"],
    "target-conn-1"
  );
  assert.equal(
    payload.result?.idMap?.["combos:source-combo-1"],
    "target-combo-1"
  );

  const connectionEvent = events.find((entry) => entry.startsWith("connection:")) ?? "";
  assert.match(connectionEvent, /"provider":"openai"/);
  assert.equal(connectionEvent.includes("attacker-controlled"), false);
  assert.equal(connectionEvent.includes("fixture-secret"), false);
  assert.match(connectionEvent, /"isActive":false/);

  const comboEvent = events.find((entry) => entry.startsWith("combo:")) ?? "";
  assert.match(comboEvent, /"connectionId":"target-conn-1"/);
});

test("TC-MIG-APPLY-API-041 existing target conflict defaults KEEP_TARGET without rewriting connection", async () => {
  const events: string[] = [];
  const d = deps(events);
  d.readTargetEntities = async () => [
    {
      category: "providerConnections" as const,
      targetId: "target-existing",
      identity: "openai|oauth|owner@example.invalid",
    },
  ];

  const response = await handleSelectiveMigrationApplyRequest(
    request([{ category: "providerConnections", sourceId: "source-conn-1" }]),
    d
  );

  assert.equal(response.status, 200);
  assert.deepEqual(events, []);
  const payload = (await response.json()) as {
    result?: { idMap?: Record<string, string | null> };
  };
  assert.equal(
    payload.result?.idMap?.["providerConnections:source-conn-1"],
    "target-existing"
  );
});
