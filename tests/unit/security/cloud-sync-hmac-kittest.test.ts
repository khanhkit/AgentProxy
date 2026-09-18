import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const ORIGINAL_CLOUD_URL = process.env.CLOUD_URL;
const ORIGINAL_PUBLIC_CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;
const ORIGINAL_SYNC_SECRET = process.env.OMNIROUTE_CLOUD_SYNC_SECRET;
const ORIGINAL_API_KEY_SECRET = process.env.API_KEY_SECRET;
const ORIGINAL_FETCH = globalThis.fetch;
const cloudSyncModuleUrl = new URL("../../../src/lib/cloudSync.ts", import.meta.url).href;

async function loadCloudSync(label: string) {
  return import(`${cloudSyncModuleUrl}?kittest=${label}-${Date.now()}-${Math.random()}`);
}

function restoreEnv() {
  if (ORIGINAL_CLOUD_URL === undefined) delete process.env.CLOUD_URL;
  else process.env.CLOUD_URL = ORIGINAL_CLOUD_URL;

  if (ORIGINAL_PUBLIC_CLOUD_URL === undefined) delete process.env.NEXT_PUBLIC_CLOUD_URL;
  else process.env.NEXT_PUBLIC_CLOUD_URL = ORIGINAL_PUBLIC_CLOUD_URL;

  if (ORIGINAL_SYNC_SECRET === undefined) delete process.env.OMNIROUTE_CLOUD_SYNC_SECRET;
  else process.env.OMNIROUTE_CLOUD_SYNC_SECRET = ORIGINAL_SYNC_SECRET;

  if (ORIGINAL_API_KEY_SECRET === undefined) delete process.env.API_KEY_SECRET;
  else process.env.API_KEY_SECRET = ORIGINAL_API_KEY_SECRET;

  globalThis.fetch = ORIGINAL_FETCH;
}

test.afterEach(restoreEnv);
test.after(restoreEnv);

test("TC-CLOUD-SEC-001 missing HMAC secret blocks cloud sync before transport", async () => {
  process.env.CLOUD_URL = "https://cloud.invalid";
  process.env.API_KEY_SECRET = "kittest-cloud-sync-api-key-secret";
  delete process.env.OMNIROUTE_CLOUD_SYNC_SECRET;

  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ data: { providers: {} }, changes: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const cloudSync = await loadCloudSync("missing-secret");
  const result = await cloudSync.syncToCloud("machine-kittest-cloud-hmac");

  assert.equal(fetchCalls, 0, "missing integrity secret must stop cloud sync before outbound fetch");
  assert.equal(
    typeof result?.error,
    "string",
    "cloud sync must return an error when OMNIROUTE_CLOUD_SYNC_SECRET is absent"
  );
});

test("TC-CLOUD-SEC-002 configured verifier rejects missing and forged signatures", async () => {
  const secret = crypto.createHash("sha256").update("kittest-cloud-hmac").digest("hex");
  process.env.OMNIROUTE_CLOUD_SYNC_SECRET = secret;

  const cloudSync = await loadCloudSync("invalid-signatures");
  const body = JSON.stringify({ data: { providers: {} } });

  assert.equal(cloudSync.verifyCloudSignature(body, null), false);
  assert.equal(cloudSync.verifyCloudSignature(body, "0".repeat(64)), false);
});

test("TC-CLOUD-SEC-003 valid HMAC remains accepted", async () => {
  const secret = crypto.createHash("sha256").update("kittest-cloud-hmac").digest("hex");
  process.env.OMNIROUTE_CLOUD_SYNC_SECRET = secret;

  const cloudSync = await loadCloudSync("valid-signature");
  const body = JSON.stringify({ data: { providers: {} } });
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  assert.equal(cloudSync.verifyCloudSignature(body, signature), true);
});
