/**
 * T-08 options-schema tests.
 *
 * Covers `parseAgentProxyPluginOptions(opts)` — the strict Zod gate that
 * validates the second-arg `PluginOptions` bag from opencode.json before
 * any hook is wired. Anti-pattern checklist mirrored here:
 *
 *  - `null` / `undefined` must collapse to `{}` (defaults apply downstream).
 *  - Unknown keys must THROW (`.strict()` catches opencode.json typos).
 *  - Validation runs at parse time, not import time (module loads cleanly).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentProxyPluginOptions } from "../src/index.js";

test("parseAgentProxyPluginOptions: undefined → {}", () => {
  assert.deepEqual(parseAgentProxyPluginOptions(undefined), {});
});

test("parseAgentProxyPluginOptions: null → {}", () => {
  assert.deepEqual(parseAgentProxyPluginOptions(null), {});
});

test("parseAgentProxyPluginOptions: empty object → {}", () => {
  assert.deepEqual(parseAgentProxyPluginOptions({}), {});
});

test("parseAgentProxyPluginOptions: valid providerId → returns it", () => {
  const r = parseAgentProxyPluginOptions({ providerId: "agentproxy-preprod" });
  assert.equal(r.providerId, "agentproxy-preprod");
});

test("parseAgentProxyPluginOptions: invalid providerId (special chars) → throws", () => {
  assert.throws(
    () => parseAgentProxyPluginOptions({ providerId: "agentproxy prod!" }),
    /providerId.*slug/i
  );
});

test("parseAgentProxyPluginOptions: empty providerId → throws", () => {
  assert.throws(() => parseAgentProxyPluginOptions({ providerId: "" }), /providerId/i);
});

test("parseAgentProxyPluginOptions: valid modelCacheTtl → returns it", () => {
  const r = parseAgentProxyPluginOptions({ modelCacheTtl: 60_000 });
  assert.equal(r.modelCacheTtl, 60_000);
});

test("parseAgentProxyPluginOptions: negative modelCacheTtl → throws", () => {
  assert.throws(() => parseAgentProxyPluginOptions({ modelCacheTtl: -1 }), /modelCacheTtl/i);
});

test("parseAgentProxyPluginOptions: zero modelCacheTtl → throws (positive required)", () => {
  assert.throws(() => parseAgentProxyPluginOptions({ modelCacheTtl: 0 }), /modelCacheTtl/i);
});

test("parseAgentProxyPluginOptions: invalid baseURL (not a URL) → throws", () => {
  assert.throws(() => parseAgentProxyPluginOptions({ baseURL: "not-a-url" }), /baseURL/i);
});

test("parseAgentProxyPluginOptions: baseURL without an http(s) scheme → throws", () => {
  // `new URL()` reads "localhost:20128" as the scheme "localhost:" followed by
  // a path, so the address parses and the models are published with an api url
  // no client can call.
  for (const baseURL of ["localhost:20128", "localhost:20128/v1", "ftp://or.example.com", "or.example.com"]) {
    assert.throws(
      () => parseAgentProxyPluginOptions({ baseURL }),
      /baseURL must be an http\(s\) URL/,
      `expected ${baseURL} to be rejected`
    );
  }
});

test("parseAgentProxyPluginOptions: http and https baseURLs are accepted, padding trimmed", () => {
  for (const baseURL of ["http://localhost:20128", "https://or.example.com/v1"]) {
    assert.equal(parseAgentProxyPluginOptions({ baseURL }).baseURL, baseURL);
    assert.equal(parseAgentProxyPluginOptions({ baseURL: `  ${baseURL}  ` }).baseURL, baseURL);
  }
});

test("parseAgentProxyPluginOptions: unknown key → throws (strict mode catches typos)", () => {
  assert.throws(
    () =>
      parseAgentProxyPluginOptions({
        providerId: "agentproxy",
        provider_id: "typo-here",
      }),
    /provider_id|unrecognized/i
  );
});

test("parseAgentProxyPluginOptions: all four fields populated correctly → returns them", () => {
  const opts = {
    providerId: "agentproxy-prod",
    displayName: "AgentProxy Production",
    modelCacheTtl: 120_000,
    baseURL: "https://or.example.com/v1",
  };
  const r = parseAgentProxyPluginOptions(opts);
  assert.deepEqual(r, opts);
});

test("parseAgentProxyPluginOptions: error message lists every issue path", () => {
  // Two bad fields at once → error string should mention BOTH.
  try {
    parseAgentProxyPluginOptions({
      providerId: "",
      baseURL: "garbage",
    });
    assert.fail("expected throw");
  } catch (err) {
    const msg = (err as Error).message;
    assert.match(msg, /providerId/);
    assert.match(msg, /baseURL/);
  }
});

test("parseAgentProxyPluginOptions: module import alone does NOT throw", async () => {
  // Re-importing the entry must not trigger validation; validation only fires
  // on explicit parseAgentProxyPluginOptions / AgentProxyPlugin invocation.
  const mod = await import("../src/index.js");
  assert.equal(typeof mod.parseAgentProxyPluginOptions, "function");
});
