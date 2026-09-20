import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const LOCALITY_HEADER = "x-agentproxy-peer-locality";

test("unit pipeline stamps a synthetic localhost Request", () => {
  const request = new Request("http://localhost/api/plugins");
  assert.equal(request.headers.get(LOCALITY_HEADER), "loopback");
});

test("unit pipeline never promotes explicit Host authority", () => {
  const request = new Request("http://localhost/api/plugins", {
    headers: { host: "localhost:20128" },
  });
  assert.equal(request.headers.get(LOCALITY_HEADER), null);
});

test("unit pipeline never promotes forwarding evidence", () => {
  const request = new Request("http://localhost/api/plugins", {
    headers: { "x-forwarded-for": "203.0.113.7" },
  });
  assert.equal(request.headers.get(LOCALITY_HEADER), null);
});

test("unit pipeline never overwrites peer-stamp evidence", () => {
  const request = new Request("http://localhost/api/plugins", {
    headers: { "x-agentproxy-peer-ip": "test-token|203.0.113.9" },
  });
  assert.equal(request.headers.get(LOCALITY_HEADER), null);
});

test("unit pipeline preserves an explicit locality verdict", () => {
  const request = new Request("http://localhost/api/plugins", {
    headers: { [LOCALITY_HEADER]: "remote" },
  });
  assert.equal(request.headers.get(LOCALITY_HEADER), "remote");
});

test("unit pipeline does not stamp a remote URL", () => {
  const request = new Request("https://dashboard.example/api/plugins");
  assert.equal(request.headers.get(LOCALITY_HEADER), null);
});

test("unit pipeline stamps a synthetic localhost NextRequest", () => {
  const request = new NextRequest("http://localhost:3000/api/plugins");
  assert.equal(request.headers.get(LOCALITY_HEADER), "loopback");
});

test("unit pipeline keeps NextRequest forwarding evidence fail-closed", () => {
  const request = new NextRequest("http://localhost:3000/api/plugins", {
    headers: { forwarded: "for=203.0.113.7;proto=https" },
  });
  assert.equal(request.headers.get(LOCALITY_HEADER), null);
});

test("unit pipeline keeps explicit NextRequest Host authority fail-closed", () => {
  const request = new NextRequest("http://localhost:3000/api/plugins", {
    headers: { host: "localhost:3000" },
  });
  assert.equal(request.headers.get(LOCALITY_HEADER), null);
});
