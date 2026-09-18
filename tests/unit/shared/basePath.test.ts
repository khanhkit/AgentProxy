import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getDeployBasePath,
  normalizeBasePath,
  withBasePath,
} from "../../../src/shared/utils/basePath";

describe("normalizeBasePath", () => {
  it("normalizes leading/trailing slashes", () => {
    assert.equal(normalizeBasePath("agentproxy"), "/agentproxy");
    assert.equal(normalizeBasePath("/agentproxy/"), "/agentproxy");
    assert.equal(normalizeBasePath("/agentproxy"), "/agentproxy");
    assert.equal(normalizeBasePath(""), "");
    assert.equal(normalizeBasePath("/"), "");
    assert.equal(normalizeBasePath(null), "");
  });
});

describe("getDeployBasePath", () => {
  it("reads NEXT_PUBLIC_AGENTPROXY_BASE_PATH first", () => {
    assert.equal(
      getDeployBasePath({
        NEXT_PUBLIC_AGENTPROXY_BASE_PATH: "/agentproxy",
        AGENTPROXY_BASE_PATH: "/other",
      } as NodeJS.ProcessEnv),
      "/agentproxy"
    );
  });

  it("falls back to AGENTPROXY_BASE_PATH", () => {
    assert.equal(
      getDeployBasePath({
        AGENTPROXY_BASE_PATH: "/agentproxy",
      } as NodeJS.ProcessEnv),
      "/agentproxy"
    );
  });
});

describe("withBasePath", () => {
  const base = "/agentproxy";

  it("is a no-op when basePath is empty", () => {
    assert.equal(withBasePath("/api/health/ping", ""), "/api/health/ping");
  });

  it("prefixes absolute app paths", () => {
    assert.equal(withBasePath("/api/health/ping", base), "/agentproxy/api/health/ping");
    assert.equal(withBasePath("/v1/models", base), "/agentproxy/v1/models");
  });

  it("does not double-prefix", () => {
    assert.equal(withBasePath("/agentproxy/api/health/ping", base), "/agentproxy/api/health/ping");
    assert.equal(withBasePath("/agentproxy", base), "/agentproxy");
  });

  it("rewrites same-origin absolute URLs", () => {
    assert.equal(
      withBasePath("https://host.example/api/x", base, "https://host.example"),
      "https://host.example/agentproxy/api/x"
    );
  });

  it("leaves external absolute URLs alone", () => {
    assert.equal(
      withBasePath("https://other.example/api/x", base, "https://host.example"),
      "https://other.example/api/x"
    );
  });

  it("leaves protocol-relative URLs alone", () => {
    assert.equal(withBasePath("//cdn.example/app.js", base), "//cdn.example/app.js");
  });
});
