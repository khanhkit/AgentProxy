import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ap0130-files-policy-"));
process.env.DATA_DIR = dataDir;
process.env.API_KEY_SECRET ||= "ap0130-files-policy-secret";

const { resetDbInstance } = await import("../../src/lib/db/core.ts");
const { createApiKey, updateApiKeyPermissions } = await import("../../src/lib/db/apiKeys.ts");
const { createFile, getFile, countFiles } = await import("../../src/lib/db/files.ts");
const filesRoute = await import("../../src/app/api/v1/files/route.ts");
const fileByIdRoute = await import("../../src/app/api/v1/files/[id]/route.ts");

after(() => {
  resetDbInstance();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function upload(key: string) {
  const form = new FormData();
  form.set("purpose", "batch");
  form.set("file", new File(["{}"], "input.jsonl", { type: "application/jsonl" }));
  return filesRoute.POST(
    new Request("http://localhost/api/v1/files", {
      method: "POST",
      headers: { "x-api-key": key },
      body: form,
    })
  );
}

test("AP-ISS-0130 bare x-api-key obeys endpoint policy and retains ownership", async () => {
  const key = await createApiKey("files-policy", "ap0130-files-policy", []);
  await updateApiKeyPermissions(key.id, { allowedEndpoints: ["chat"] });

  const rejected = await upload(key.key);
  assert.equal(rejected.status, 403);
  assert.equal(countFiles({ apiKeyId: key.id }), 0);

  await updateApiKeyPermissions(key.id, { allowedEndpoints: ["files"] });
  const allowed = await upload(key.key);
  assert.equal(allowed.status, 200);
  const body = (await allowed.json()) as { id?: string };
  assert.ok(body.id);
  assert.equal(getFile(body.id)?.apiKeyId, key.id);
});

test("AP-ISS-0130 API keys cannot read null-owner files", async () => {
  const key = await createApiKey("files-owner", "ap0130-files-owner", []);
  await updateApiKeyPermissions(key.id, { allowedEndpoints: ["files"] });
  const unowned = createFile({
    bytes: 2,
    filename: "unowned.jsonl",
    purpose: "batch",
    content: Buffer.from("{}"),
    mimeType: "application/jsonl",
    apiKeyId: null,
  });

  const response = await fileByIdRoute.GET(
    new Request(`http://localhost/api/v1/files/${unowned.id}`, {
      headers: { Authorization: `Bearer ${key.key}` },
    }),
    { params: Promise.resolve({ id: unowned.id }) }
  );

  assert.equal(response.status, 404);
});
