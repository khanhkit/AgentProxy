import { describe, it } from "node:test";
import assert from "node:assert";

process.env.API_KEY_SECRET ||= "files-api-limit-validation-secret";
import { createFile, deleteFile } from "@/lib/db/files";
import { GET, parseFilesListQuery } from "@/app/api/v1/files/route";
import { createApiKey, deleteApiKey, updateApiKeyPermissions } from "@/lib/db/apiKeys";

describe("GET /v1/files limit validation", () => {
  it("defaults to 20 when limit is absent", () => {
    const parsed = parseFilesListQuery(new URLSearchParams("order=asc"));

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.limit, 20);
  });

  it("parses an explicit positive integer limit", () => {
    const parsed = parseFilesListQuery(new URLSearchParams("limit=2&order=asc&purpose=batch"));

    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.limit, 2);
    assert.equal(parsed.order, "asc");
    assert.equal(parsed.purpose, "batch");
  });

  it("rejects non-integer, zero, and oversized limits", async () => {
    for (const rawLimit of ["abc", "1.5", "-1", "0", "10001"]) {
      const parsed = parseFilesListQuery(
        new URLSearchParams(`limit=${encodeURIComponent(rawLimit)}`)
      );
      assert.equal(parsed.ok, false, `limit=${rawLimit} should be rejected`);
      if (parsed.ok) continue;
      assert.equal(parsed.response.status, 400);
      const body = await parsed.response.json();
      assert.equal(body.error.type, "invalid_request_error");
    }
  });

  it("returns only the requested number of files over HTTP", async () => {
    const caller = await createApiKey("files-limit-http", "files-limit-http-machine", []);
    await updateApiKeyPermissions(caller.id, { allowedEndpoints: ["files"] });
    const created = [
      createFile({
        bytes: 1,
        filename: "test-files-limit-http-a.txt",
        purpose: "assistants",
        content: Buffer.from("a"),
        mimeType: "text/plain",
        apiKeyId: caller.id,
      }),
      createFile({
        bytes: 1,
        filename: "test-files-limit-http-b.txt",
        purpose: "assistants",
        content: Buffer.from("b"),
        mimeType: "text/plain",
        apiKeyId: caller.id,
      }),
    ];

    try {
      const response = await GET(
        new Request("http://localhost/v1/files?limit=1&purpose=assistants", {
          headers: { Authorization: `Bearer ${caller.key}` },
        })
      );
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.object, "list");
      assert.equal(body.data.length, 1);
      assert.equal(body.has_more, true);
    } finally {
      for (const file of created) deleteFile(file.id);
      await deleteApiKey(caller.id);
    }
  });

  it("returns 400 over HTTP for an invalid limit instead of listing files", async () => {
    const caller = await createApiKey("files-limit-invalid", "files-limit-invalid-machine", []);
    await updateApiKeyPermissions(caller.id, { allowedEndpoints: ["files"] });
    const response = await GET(
      new Request("http://localhost/v1/files?limit=-1", {
        headers: { Authorization: `Bearer ${caller.key}` },
      })
    );

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.type, "invalid_request_error");
    await deleteApiKey(caller.id);
  });
});
