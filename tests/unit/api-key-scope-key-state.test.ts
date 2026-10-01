import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-key-state-"));
process.env.DATA_DIR = dir;
process.env.API_KEY_SECRET = "key-state-secret";
const core = await import("../../src/lib/db/core.ts");
const { createApiKey, revokeApiKey } = await import("../../src/lib/db/apiKeys.ts");
const { getApiKeyRequestScope } = await import("../../src/app/api/v1/_helpers/apiKeyScope.ts");

test.after(() => { core.resetDbInstance(); fs.rmSync(dir, { recursive: true, force: true }); });

test("api key scope exposes none/unresolved/valid/invalid lifecycle states", async () => {
  const valid = await createApiKey("state-valid", "machine", []);
  const revoked = await createApiKey("state-revoked", "machine", []);
  await revokeApiKey(revoked.id);
  const scope = (token?: string) => getApiKeyRequestScope(new Request("http://localhost/v1/files", { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
  assert.equal((await scope()).keyState, "none");
  assert.equal((await scope("never-issued")).keyState, "unresolved");
  const good = await scope(valid.key); assert.equal(good.keyState, "valid"); assert.equal(good.apiKeyId, valid.id);
  const bad = await scope(revoked.key); assert.equal(bad.keyState, "invalid"); assert.equal(bad.apiKeyId, null); assert.equal(bad.apiKeyMetadata, null);
});
