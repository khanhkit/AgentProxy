import test from "node:test";
import assert from "node:assert/strict";

process.env.AGENTPROXY_PEER_STAMP_TOKEN = "test-stamp";

const { getLoginLockoutKey, getLoginSourceScope, isHostOperatorRequest } =
  await import("../../src/server/auth/loginPeer.ts");
const { AUTHZ_HEADER_TRUSTED_PEER_IP, AUTHZ_HEADER_PEER_LOCALITY } =
  await import("../../src/server/authz/headers.ts");

test("remote peer cannot forge loopback through forwarding headers", () => {
  const req = new Request("http://agentproxy.example/api/auth/login", {
    headers: {
      [AUTHZ_HEADER_TRUSTED_PEER_IP]: "203.0.113.9",
      [AUTHZ_HEADER_PEER_LOCALITY]: "remote",
      "x-forwarded-for": "127.0.0.1",
    },
  });
  assert.equal(isHostOperatorRequest(req), false);
  assert.equal(getLoginLockoutKey(req, "127.0.0.1"), "203.0.113.9");
  assert.equal(getLoginSourceScope(req, "127.0.0.1"), "public");
});

test("loopback stamped localhost remains an allowed host-operator path", () => {
  const req = new Request("http://localhost/api/auth/login", {
    headers: {
      [AUTHZ_HEADER_TRUSTED_PEER_IP]: "127.0.0.1",
      [AUTHZ_HEADER_PEER_LOCALITY]: "loopback",
    },
  });
  assert.equal(isHostOperatorRequest(req), true);
  assert.equal(getLoginSourceScope(req, "203.0.113.9"), "loopback");
});

test("missing peer stamp fails closed to one shared lockout key", () => {
  const req = new Request("http://agentproxy.example/api/auth/login", {
    headers: { "x-forwarded-for": "127.0.0.1" },
  });
  assert.equal(getLoginLockoutKey(req, "127.0.0.1"), "__unknown_peer__");
  assert.equal(isHostOperatorRequest(req), false);
});
