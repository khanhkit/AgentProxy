import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-settings-writers-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.DISABLE_SQLITE_AUTO_BACKUP = "true";

const core = await import("../../src/lib/db/core.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const databaseSettings = await import("../../src/lib/db/databaseSettings.ts");
const combos = await import("../../src/lib/db/combos.ts");
const subscriptions = await import("../../src/lib/proxySubscription/subscriptionService.ts");
const cliSettingsStore = await import("../../bin/cli/settings-store.mjs");

function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

async function revision(): Promise<number> {
  return settingsDb.getSettingsRevision();
}

test.beforeEach(resetStorage);
test.after(resetStorage);

test("databaseSettings compatibility write advances shared revision once on mutation", async () => {
  const current = databaseSettings.getUserDatabaseSettings();
  const before = await revision();
  const nextLogs = {
    ...current.logs,
    callLogPipelineEnabled: !current.logs.callLogPipelineEnabled,
  };

  databaseSettings.updateDatabaseSettings({ logs: nextLogs });
  assert.equal(await revision(), before + 1);

  databaseSettings.updateDatabaseSettings({ logs: nextLogs });
  assert.equal(await revision(), before + 1, "idempotent compatibility write must not double-bump");
});

test("setActiveCombo advances shared revision once per actual setting mutation", async () => {
  const before = await revision();

  combos.setActiveCombo("task7-combo");
  assert.equal(await revision(), before + 1);

  combos.setActiveCombo("task7-combo");
  assert.equal(await revision(), before + 1, "same active combo must not double-bump");
});

test("proxy subscription proxyEnabled recomputation advances shared revision once", async () => {
  const before = await revision();
  const created = await subscriptions.createSubscription({
    name: "task7-disabled",
    url: "https://example.com/subscription.txt",
    enabled: false,
  });

  assert.equal(await revision(), before);
  assert.equal(await subscriptions.deleteSubscription(created.id), true);
  assert.equal(await revision(), before + 1);
  assert.equal((await settingsDb.getSettings()).proxyEnabled, false);
});

test("CLI settings-store update mirrors the shared revision contract", async () => {
  const db = core.getDbInstance();
  const before = await revision();

  cliSettingsStore.updateSettings(db, { debugMode: true });
  assert.equal(await revision(), before + 1);

  cliSettingsStore.updateSettings(db, { debugMode: false });
  assert.equal(await revision(), before + 2);
});

function walkProductionFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "migrations", "generated", ".next"].includes(entry.name)) continue;
      files.push(...walkProductionFiles(full));
    } else if (/\.(?:ts|tsx|mjs|js)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

test("production raw settings mutations stay confined to authority implementations", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "../..");
  const roots = ["src", "open-sse", "bin"].map((relative) => path.join(repoRoot, relative));
  const rawSettingsMutation =
    /(?:INSERT\s+(?:OR\s+REPLACE\s+)?INTO|UPDATE|DELETE\s+FROM)\s+key_value[\s\S]{0,260}?(?:namespace\s*=\s*['"]settings['"]|['"]settings['"])/gi;
  const allowed = new Set([
    "src/lib/db/settings.ts",
    "src/lib/db/settingsRevision.ts",
    "bin/cli/settings-store.mjs",
  ]);
  const offenders: string[] = [];

  for (const root of roots) {
    for (const file of walkProductionFiles(root)) {
      const relative = path.relative(repoRoot, file).split(path.sep).join("/");
      const source = fs.readFileSync(file, "utf8");
      if (rawSettingsMutation.test(source) && !allowed.has(relative)) offenders.push(relative);
      rawSettingsMutation.lastIndex = 0;
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `raw settings mutations must route through the revision authority: ${offenders.join(", ")}`
  );
});
