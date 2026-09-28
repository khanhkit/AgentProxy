import test from "node:test";
import assert from "node:assert/strict";

import { AUTHZ_HEADER_PEER_LOCALITY } from "../../src/server/authz/headers.ts";
import { INTERNAL_SERVICE_AUTH_HEADER } from "../../src/lib/api/internalServiceAuth.ts";
import { createRustCoreSnapshotHandler } from "../../src/lib/rustCore/snapshotRoute.ts";

const TOKEN = "rust-core-internal-token-0123456789";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "codex-a",
    provider: "codex",
    isActive: true,
    accessToken: "access-secret",
    refreshToken: "never-export-refresh",
    idToken: "never-export-id",
    rateLimitedUntil: null,
    maxConcurrent: 3,
    updatedAt: "2026-09-12T00:00:00.000Z",
    providerSpecificData: { workspaceId: "workspace-a" },
    ...overrides,
  };
}

function request(locality: "loopback" | "remote", token = TOKEN) {
  return new Request("http://127.0.0.1:20129/api/internal/rust-core/snapshot", {
    headers: {
      [AUTHZ_HEADER_PEER_LOCALITY]: locality,
      [INTERNAL_SERVICE_AUTH_HEADER]: token,
    },
  });
}

test.beforeEach(() => {
  process.env.AGENTPROXY_INTERNAL_SERVICE_TOKEN = TOKEN;
});

test.afterEach(() => {
  delete process.env.AGENTPROXY_INTERNAL_SERVICE_TOKEN;
});

test("Rust snapshot handler rejects a remote peer even with the correct token", async () => {
  let reads = 0;
  const handler = createRustCoreSnapshotHandler({
    getConnections: async () => {
      reads += 1;
      return [row()];
    },
  });

  const response = await handler(request("remote"));
  assert.equal(response.status, 403);
  assert.equal(reads, 0);
});

test("Rust snapshot handler rejects a loopback peer with the wrong token", async () => {
  let reads = 0;
  const handler = createRustCoreSnapshotHandler({
    getConnections: async () => {
      reads += 1;
      return [row()];
    },
  });

  const response = await handler(request("loopback", "wrong-token"));
  assert.equal(response.status, 403);
  assert.equal(reads, 0);
});

test("Rust snapshot handler returns only effective Codex runtime credentials", async () => {
  const handler = createRustCoreSnapshotHandler({
    getConnections: async () => [row()],
  });

  const first = await handler(request("loopback"));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  const body = await first.json();
  assert.equal(body.schema_version, 1);
  assert.equal(body.generation, 1);
  assert.equal(body.codex_connections.length, 1);
  assert.equal(body.codex_connections[0].access_token, "access-secret");
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("never-export-refresh"), false);
  assert.equal(serialized.includes("never-export-id"), false);

  const second = await handler(request("loopback"));
  const secondBody = await second.json();
  assert.equal(secondBody.generation, 1, "no-op polls must not rebuild Rust runtime state");
});
