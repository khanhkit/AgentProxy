import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-runtime-config-routes-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.REQUIRE_API_KEY = "false";

const core = await import("../../src/lib/db/core.ts");
const { invalidateDbCache } = await import("../../src/lib/db/readCache.ts");
const thinkingRoute = await import("../../src/app/api/settings/thinking-budget/route.ts");
const taskRoutingRoute = await import("../../src/app/api/settings/task-routing/route.ts");
const { DEFAULT_THINKING_CONFIG, getThinkingBudgetConfig, setThinkingBudgetConfig } =
  await import("../../open-sse/services/thinkingBudget.ts");
const { getTaskRoutingConfig, setTaskRoutingConfig, getDefaultTaskModelMap } =
  await import("../../open-sse/services/taskAwareRouter.ts");
const { makeManagementSessionRequest } = await import("../helpers/managementSession.ts");

type DatabaseWithPrepare = ReturnType<typeof core.getDbInstance> & {
  prepare: (sql: string) => unknown;
};

function failSettingsWrites<T>(run: () => Promise<T>): Promise<T> {
  const db = core.getDbInstance() as DatabaseWithPrepare;
  const originalPrepare = db.prepare;
  db.prepare = ((sql: string) => {
    if (sql.includes("INSERT OR REPLACE INTO key_value") && sql.includes("'settings'")) {
      throw new Error("injected settings persistence failure");
    }
    return originalPrepare.call(db, sql);
  }) as typeof db.prepare;

  return run().finally(() => {
    db.prepare = originalPrepare;
  });
}

test.beforeEach(() => {
  invalidateDbCache("settings");
  setThinkingBudgetConfig(DEFAULT_THINKING_CONFIG);
  setTaskRoutingConfig({
    enabled: false,
    detectionEnabled: true,
    taskModelMap: getDefaultTaskModelMap(),
    patternOverrides: undefined,
  });
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("thinking-budget persistence failure leaves the previous in-memory config active", async () => {
  const request = await makeManagementSessionRequest(
    "http://localhost/api/settings/thinking-budget",
    {
      method: "PUT",
      body: { mode: "custom", customBudget: 4096, effortLevel: "low" },
    }
  );
  const response = await failSettingsWrites(() => thinkingRoute.PUT(request));

  assert.equal(response.status, 500);
  assert.deepEqual(getThinkingBudgetConfig(), DEFAULT_THINKING_CONFIG);
});

test("task-routing persistence failure leaves the previous in-memory config active", async () => {
  const before = getTaskRoutingConfig();
  const request = await makeManagementSessionRequest("http://localhost/api/settings/task-routing", {
    method: "PUT",
    body: {
      enabled: true,
      detectionEnabled: false,
      taskModelMap: { coding: "auto/coding" },
    },
  });
  const response = await failSettingsWrites(() => taskRoutingRoute.PUT(request));

  assert.equal(response.status, 500);
  assert.equal(getTaskRoutingConfig().enabled, before.enabled);
  assert.equal(getTaskRoutingConfig().detectionEnabled, before.detectionEnabled);
  assert.deepEqual(getTaskRoutingConfig().taskModelMap, before.taskModelMap);
});
