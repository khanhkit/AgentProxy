import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SignJWT } from "jose";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-batch-item-ap0197-"));
process.env.DATA_DIR = dir;
process.env.API_KEY_SECRET = "batch-item-ap0197-api-secret";
process.env.JWT_SECRET = "batch-item-ap0197-jwt-secret";

const core = await import("../../src/lib/db/core.ts");
const { createApiKey } = await import("../../src/lib/db/apiKeys.ts");
const { createFile } = await import("../../src/lib/db/files.ts");
const { createBatch } = await import("../../src/lib/db/batches.ts");
const batchItem = await import("../../src/app/api/v1/batches/[id]/route.ts");

async function sessionCookie(): Promise<string> {
  const jwt = await new SignJWT({ authenticated: true, sub: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  return `auth_token=${jwt}`;
}

function seed(apiKeyId: string, label: string) {
  const file = createFile({ filename: `${label}.jsonl`, purpose: "batch", bytes: 2, apiKeyId });
  return createBatch({
    endpoint: "/v1/chat/completions",
    completionWindow: "24h",
    inputFileId: file.id,
    status: "completed",
    apiKeyId,
  });
}

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("dashboard session ignores an incidental stale bearer key on batch item access", async () => {
  const owner = await createApiKey("batch-owner", "batch-owner-machine", []);
  const batch = seed(owner.id, "stale-session");
  const response = await batchItem.GET(
    new Request(`http://localhost/api/v1/batches/${batch.id}`, {
      headers: {
        cookie: await sessionCookie(),
        Authorization: "Bearer sk-omni-stale-rotated-key-ap0197",
      },
    }),
    { params: Promise.resolve({ id: batch.id }) }
  );
  assert.equal(response.status, 200);
});

test("policy-only manage x-api-key can access another key's batch", async () => {
  const manager = await createApiKey("batch-manager", "batch-manager-machine", ["manage"]);
  const owner = await createApiKey("batch-owner-two", "batch-owner-machine-two", []);
  const batch = seed(owner.id, "manage-policy-only");
  const response = await batchItem.GET(
    new Request(`http://localhost/api/v1/batches/${batch.id}`, {
      headers: { "x-api-key": manager.key },
    }),
    { params: Promise.resolve({ id: batch.id }) }
  );
  assert.equal(response.status, 200);
});
