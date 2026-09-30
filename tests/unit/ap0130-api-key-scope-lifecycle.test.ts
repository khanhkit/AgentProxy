import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ap0130-api-key-scope-"));
process.env.DATA_DIR = dataDir;
process.env.API_KEY_SECRET ||= "ap0130-api-key-scope-secret";

const { resetDbInstance } = await import("../../src/lib/db/core.ts");
const { createApiKey, revokeApiKey } = await import("../../src/lib/db/apiKeys.ts");
const { getApiKeyRequestScope } = await import("../../src/app/api/v1/_helpers/apiKeyScope.ts");

after(() => {
  resetDbInstance();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function requestFor(key: string) {
  return new Request("http://localhost/api/v1/files", {
    headers: { Authorization: `Bearer ${key}` },
  });
}

test("getApiKeyRequestScope preserves active-key ownership", async () => {
  const created = await createApiKey("active", "ap0130-active", []);
  const scope = await getApiKeyRequestScope(requestFor(created.key));

  assert.equal(scope.apiKeyId, created.id);
  assert.equal(scope.apiKeyMetadata?.id, created.id);
});

test("getApiKeyRequestScope fails closed after key revocation", async () => {
  const created = await createApiKey("revoked", "ap0130-revoked", []);
  assert.equal(await revokeApiKey(created.id), true);

  const scope = await getApiKeyRequestScope(requestFor(created.key));

  assert.equal(scope.apiKeyId, null);
  assert.equal(scope.apiKeyMetadata, null);
});
