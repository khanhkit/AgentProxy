import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-scope-ap0197-"));
process.env.DATA_DIR = dir;
process.env.API_KEY_SECRET = "scope-ap0197-secret";

const core = await import("../../src/lib/db/core.ts");
const { createApiKey } = await import("../../src/lib/db/apiKeys.ts");
const {
  canAccessOwnedRecord,
  getPolicyAwareApiKeyRequestScope,
  resolveEffectiveApiKeyId,
  resolveListScope,
} = await import("../../src/app/api/v1/_helpers/apiKeyScope.ts");

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("dashboard session remains instance-authority even when an API key id is also present", () => {
  const scope = {
    apiKey: "incidental-key",
    apiKeyId: "tenant-a",
    apiKeyMetadata: { scopes: [] } as never,
    keyState: "valid" as const,
    rejection: null,
    isSessionAuth: true,
  };
  assert.equal(canAccessOwnedRecord(scope, "tenant-b"), true);
  assert.equal(resolveEffectiveApiKeyId(scope, { id: "tenant-a" }), null);
  assert.deepEqual(resolveListScope(scope), { mode: "instance" });
});

test("policy-only x-api-key hydrates manage metadata instead of being demoted to owner scope", async () => {
  const key = await createApiKey("policy-only-manage", "machine-policy-only", ["manage"]);
  const scope = await getPolicyAwareApiKeyRequestScope(
    new Request("http://localhost/api/v1/batches", { headers: { "x-api-key": key.key } })
  );
  assert.equal(scope.rejection, null);
  assert.equal(scope.apiKeyId, key.id);
  assert.equal(scope.apiKeyMetadata?.scopes.includes("manage"), true);
  assert.deepEqual(resolveListScope(scope), { mode: "instance" });
});
