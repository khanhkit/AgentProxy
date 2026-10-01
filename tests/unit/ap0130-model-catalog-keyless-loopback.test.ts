import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-models-keyless-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || "ap0130-models-keyless-secret";
delete process.env.INITIAL_PASSWORD;

const core = await import("../../src/lib/db/core.ts");
const settingsDb = await import("../../src/lib/db/settings.ts");
const apiKeysDb = await import("../../src/lib/db/apiKeys.ts");
const { getModelCatalogAuthRejection } =
  await import("../../src/app/api/v1/models/catalogRequest.ts");
const { AUTHZ_HEADER_PEER_LOCALITY } = await import("../../src/server/authz/headers.ts");

function request(locality: "loopback" | "lan" | "remote") {
  const host =
    locality === "loopback" ? "127.0.0.1" : locality === "lan" ? "172.17.0.1" : "203.0.113.7";
  return new Request(`http://${host}:20128/v1/models`, {
    headers: { [AUTHZ_HEADER_PEER_LOCALITY]: locality },
  });
}

test.after(() => {
  core.resetDbInstance();
  apiKeysDb.resetApiKeyState();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("AP-ISS-0130 keeps /v1/models keyless only for trusted loopback with no credential surface", async () => {
  await settingsDb.updateSettings({
    setupComplete: true,
    requireLogin: true,
    password: "",
    oidcEnabled: false,
    requireAuthForModels: true,
  });
  let settings = (await settingsDb.getSettings()) as Record<string, unknown>;

  assert.equal(await getModelCatalogAuthRejection(request("loopback"), settings, {}), null);

  const remote = await getModelCatalogAuthRejection(request("remote"), settings, {});
  assert.equal(remote?.status, 401);

  await apiKeysDb.createApiKey("catalog-key", "machine-ap0130");
  const withApiKey = await getModelCatalogAuthRejection(request("loopback"), settings, {});
  assert.equal(withApiKey?.status, 401);

  apiKeysDb.resetApiKeyState();
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  await settingsDb.updateSettings({
    setupComplete: true,
    requireLogin: true,
    password: "configured-password-hash",
    oidcEnabled: false,
    requireAuthForModels: true,
  });
  settings = (await settingsDb.getSettings()) as Record<string, unknown>;
  const withPassword = await getModelCatalogAuthRejection(request("loopback"), settings, {});
  assert.equal(withPassword?.status, 401);
});
