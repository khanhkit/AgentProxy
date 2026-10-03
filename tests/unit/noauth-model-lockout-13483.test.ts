import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-noauth-lockout-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "test-noauth-lockout-secret";

const core = await import("../../src/lib/db/core.ts");
const auth = await import("../../src/sse/services/auth.ts");
const { recordModelLockoutFailure, clearAllModelLockouts } =
  await import("../../open-sse/services/accountFallback.ts");

after(() => {
  clearAllModelLockouts();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("noauth provider honors model-only lockout on synthetic connection", async () => {
  clearAllModelLockouts();
  const provider = "opencode";
  const model = "deepseek-v4-flash-free";

  recordModelLockoutFailure(provider, "noauth", model, "model_capacity", 400, 1_800_000);

  assert.equal(await auth.getProviderCredentials(provider, null, null, model), null);
});

test("noauth provider still returns credentials for a different unlocked model", async () => {
  clearAllModelLockouts();
  const provider = "opencode";
  recordModelLockoutFailure(provider, "noauth", "locked-model", "model_capacity", 400, 1_800_000);

  assert.ok(await auth.getProviderCredentials(provider, null, null, "other-model"));
});
