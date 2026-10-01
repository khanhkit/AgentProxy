import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-openrouter-baseurl-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const providerModelsRoute = await import("../../src/app/api/providers/[id]/models/route.ts");

const originalFetch = globalThis.fetch;
const EU_BASE_URL = "https://eu.openrouter.ai/api/v1";
const GLOBAL_CATALOG_URL = "https://openrouter.ai/api/v1/models";

async function resetStorage() {
  globalThis.fetch = originalFetch;
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

async function seed(providerSpecificData: Record<string, unknown>) {
  return providersDb.createProviderConnection({
    provider: "openrouter",
    authType: "apikey",
    name: `openrouter-${Math.random().toString(16).slice(2, 8)}`,
    apiKey: "openrouter-test-key",
    isActive: true,
    testStatus: "active",
    providerSpecificData,
  });
}

async function discover(connectionId: string) {
  const seenUrls: string[] = [];
  globalThis.fetch = async (url) => {
    seenUrls.push(String(url));
    return Response.json({ data: [{ id: "openai/gpt-5.6-luna" }] });
  };
  const response = await providerModelsRoute.GET(
    new Request(`http://localhost/api/providers/${connectionId}/models?refresh=true`),
    { params: { id: connectionId } }
  );
  return { response, seenUrls };
}

test.beforeEach(resetStorage);
test.after(async () => {
  globalThis.fetch = originalFetch;
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("OpenRouter discovery honors per-connection base URL override", async () => {
  const connection = await seed({ baseUrl: EU_BASE_URL });
  const { response, seenUrls } = await discover(connection.id);
  assert.equal(response.status, 200);
  assert.ok(seenUrls.some((url) => url.startsWith(`${EU_BASE_URL}/models`)), JSON.stringify(seenUrls));
  assert.ok(!seenUrls.some((url) => url.startsWith(GLOBAL_CATALOG_URL)), JSON.stringify(seenUrls));
});

test("OpenRouter discovery keeps global catalog without override", async () => {
  const connection = await seed({});
  const { response, seenUrls } = await discover(connection.id);
  assert.equal(response.status, 200);
  assert.ok(seenUrls.some((url) => url.startsWith(GLOBAL_CATALOG_URL)), JSON.stringify(seenUrls));
});
