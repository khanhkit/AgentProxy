import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-self-loop-auth-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.API_KEY_SECRET = "self-loop-test-secret";
delete process.env.AGENTPROXY_API_KEY;
delete process.env.ROUTER_API_KEY;

const core = await import("../../src/lib/db/core.ts");
const apiKeys = await import("../../src/lib/db/apiKeys.ts");
const { resolveSelfLoopBearer, peekGeneratedSelfLoopSecret } =
  await import("../../src/shared/middleware/chatAdmissionIdentity.ts");
const { isSyntheticApiKeyId } =
  await import("../../src/shared/constants/apiKeyIdentities.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

test("generated self-loop bearer authenticates without creating a DB key", async () => {
  const bearer = resolveSelfLoopBearer();
  assert.equal(peekGeneratedSelfLoopSecret(), bearer);
  assert.equal(await apiKeys.validateApiKey(bearer), true);
  assert.equal(await apiKeys.validateApiKey(bearer + "x"), false);
  assert.equal((await apiKeys.getApiKeys()).length, 0);
});

test("self-loop metadata is synthetic and narrowly scoped", async () => {
  const meta = await apiKeys.getApiKeyMetadata(resolveSelfLoopBearer());
  assert.equal(meta?.id, "self-loop");
  assert.equal(isSyntheticApiKeyId(meta?.id), true);
  assert.deepEqual(meta?.scopes, ["internal:self-loop"]);
  assert.deepEqual(meta?.allowedEndpoints, ["chat", "audio"]);
  assert.equal(meta?.modelAccessMode, "all");
});

test("validation never creates the self-loop secret", async () => {
  delete (globalThis as unknown as Record<symbol, unknown>)[Symbol.for("agentproxy.selfLoopSecret")];
  assert.equal(await apiKeys.validateApiKey("not-real"), false);
  assert.equal(peekGeneratedSelfLoopSecret(), null);
});
