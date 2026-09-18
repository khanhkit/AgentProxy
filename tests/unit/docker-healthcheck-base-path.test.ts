import test from "node:test";
import assert from "node:assert/strict";
import { resolveHealthPath } from "../../scripts/dev/healthcheck.mjs";

test("resolveHealthPath keeps the default lightweight /healthz route at the domain root (#10311)", () => {
  assert.equal(resolveHealthPath(""), "/healthz");
  assert.equal(resolveHealthPath(undefined), "/healthz");
});

test("resolveHealthPath prefixes the health route with AGENTPROXY_BASE_PATH", () => {
  assert.equal(resolveHealthPath("/agentproxy/"), "/agentproxy/healthz");
  assert.equal(resolveHealthPath("/agentproxy"), "/agentproxy/healthz");
});

test("resolveHealthPath honors an explicit AGENTPROXY_HEALTHCHECK_PATH override", () => {
  assert.equal(resolveHealthPath(undefined, "/api/monitoring/health"), "/api/monitoring/health");
  assert.equal(
    resolveHealthPath("/agentproxy", "/api/monitoring/health"),
    "/agentproxy/api/monitoring/health"
  );
});

test("resolveHealthPath ignores an invalid/empty AGENTPROXY_HEALTHCHECK_PATH and falls back to /healthz", () => {
  assert.equal(resolveHealthPath("", "  "), "/healthz");
  assert.equal(resolveHealthPath("", "/../etc/passwd"), "/healthz");
  assert.equal(resolveHealthPath("", "/health?utm=1"), "/healthz");
});
