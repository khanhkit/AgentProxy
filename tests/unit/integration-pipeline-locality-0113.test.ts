import test from "node:test";
import assert from "node:assert/strict";

const NativeRequest = globalThis.Request;
await import("../_setup/integrationPipelineLocality.ts");

test.after(() => {
  globalThis.Request = NativeRequest;
});

test("integration locality shim stamps direct loopback fixtures", () => {
  const request = new Request("http://localhost/api/settings/proxies");
  assert.equal(request.headers.get("x-agentproxy-peer-locality"), "loopback");
});

test("integration locality shim preserves an explicit remote verdict", () => {
  const request = new Request("http://localhost/api/settings/proxies", {
    headers: { "x-agentproxy-peer-locality": "remote" },
  });
  assert.equal(request.headers.get("x-agentproxy-peer-locality"), "remote");
});

test("integration locality shim does not promote forwarded localhost traffic", () => {
  const request = new Request("http://localhost/api/settings/proxies", {
    headers: { "x-forwarded-for": "203.0.113.10" },
  });
  assert.equal(request.headers.get("x-agentproxy-peer-locality"), null);
});

test("integration locality shim does not stamp non-loopback URLs", () => {
  const request = new Request("https://example.com/api/settings/proxies");
  assert.equal(request.headers.get("x-agentproxy-peer-locality"), null);
});
