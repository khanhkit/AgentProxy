import test from "node:test";
import assert from "node:assert/strict";

import { INTERNAL_SERVICE_AUTH_HEADER } from "../../src/lib/api/internalServiceAuth.ts";
import { createRustCoreSnapshotHandler } from "../../src/lib/rustCore/snapshotRoute.ts";
import { AUTHZ_HEADER_PEER_LOCALITY } from "../../src/server/authz/headers.ts";

const TEST_SERVICE_TOKEN = "test-service-token";

function request(etag?: string) {
  const headers = new Headers({
    [AUTHZ_HEADER_PEER_LOCALITY]: "loopback",
    [INTERNAL_SERVICE_AUTH_HEADER]: TEST_SERVICE_TOKEN,
  });
  if (etag) headers.set("If-None-Match", etag);
  return new Request("http://127.0.0.1:20129/api/internal/rust-core/snapshot", { headers });
}

test("AP-ISS-0087 snapshot handler returns ETag and 304 without a response body until data changes", async () => {
  process.env.AGENTPROXY_INTERNAL_SERVICE_TOKEN = TEST_SERVICE_TOKEN;
  let accessToken = "test-access-v1";
  const handler = createRustCoreSnapshotHandler({
    getConnections: async () => [
      {
        id: "codex-a",
        provider: "codex",
        isActive: true,
        accessToken,
        rateLimitedUntil: null,
        updatedAt: "2026-09-16T00:00:00.000Z",
        providerSpecificData: {},
      },
    ],
  });

  try {
    const first = await handler(request());
    assert.equal(first.status, 200);
    const etag = first.headers.get("etag");
    assert.ok(etag, "snapshot responses must expose an ETag validator");
    const firstBody = (await first.json()) as { generation: number };
    assert.equal(firstBody.generation, 1);

    const unchanged = await handler(request(etag));
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.headers.get("etag"), etag);
    assert.equal(await unchanged.text(), "", "304 must avoid transferring snapshot body bytes");

    accessToken = "test-access-v2";
    const changed = await handler(request(etag));
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get("etag"), etag);
    const changedBody = (await changed.json()) as { generation: number };
    assert.equal(changedBody.generation, 2);
  } finally {
    delete process.env.AGENTPROXY_INTERNAL_SERVICE_TOKEN;
  }
});
