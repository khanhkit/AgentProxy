import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AGENTPROXY_BASE_URL,
  resolveAgentProxyBaseUrl,
} from "../../src/shared/utils/resolveAgentProxyBaseUrl.ts";

test("resolveAgentProxyBaseUrl prefers AGENTPROXY_BASE_URL", () => {
  assert.equal(
    resolveAgentProxyBaseUrl({
      AGENTPROXY_BASE_URL: "https://internal.example.com/",
      BASE_URL: "https://base.example.com",
      NEXT_PUBLIC_BASE_URL: "https://public.example.com",
    }),
    "https://internal.example.com"
  );
});

test("resolveAgentProxyBaseUrl falls back to BASE_URL", () => {
  assert.equal(
    resolveAgentProxyBaseUrl({
      BASE_URL: "https://base.example.com/",
      NEXT_PUBLIC_BASE_URL: "https://public.example.com",
    }),
    "https://base.example.com"
  );
});

test("resolveAgentProxyBaseUrl falls back to NEXT_PUBLIC_BASE_URL", () => {
  assert.equal(
    resolveAgentProxyBaseUrl({
      NEXT_PUBLIC_BASE_URL: "https://public.example.com/",
    }),
    "https://public.example.com"
  );
});

test("resolveAgentProxyBaseUrl ignores blank values", () => {
  assert.equal(
    resolveAgentProxyBaseUrl({
      AGENTPROXY_BASE_URL: "   ",
      BASE_URL: "",
      NEXT_PUBLIC_BASE_URL: " https://public.example.com/ ",
    }),
    "https://public.example.com"
  );
});

test("resolveAgentProxyBaseUrl uses the default localhost fallback", () => {
  assert.equal(resolveAgentProxyBaseUrl({}), DEFAULT_AGENTPROXY_BASE_URL);
});
