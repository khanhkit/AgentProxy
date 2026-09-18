/**
 * Tests for the bypass / passthrough / target routing primitives used by
 * the CJS proxy in `src/mitm/server.cjs`.
 *
 * The CJS proxy itself cannot be required in tests (it spawns a TLS server
 * and exits when ROUTER_API_KEY is missing). Instead, we exercise the
 * `_internal/bypass.cjs` shim that `server.cjs` depends on. That shim
 * carries all the routing logic — `server.cjs` is now a thin wiring layer
 * around it.
 *
 * Plan reference:
 *   - 11-agent-bridge.plan.md §4.6
 *   - master-plan-group-A.md §3.5 / §12 #16
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const requireCjs = createRequire(import.meta.url);
const shim = requireCjs("../../src/mitm/_internal/bypass.cjs") as {
  DEFAULT_BYPASS_PATTERNS: RegExp[];
  bypassGlobMatch: (h: string, p: string) => boolean;
  routeBypass: (
    h: string,
    targetHosts: Set<string> | string[] | undefined,
    userPatterns: string[]
  ) => "bypass" | "target" | "passthrough";
  parseBypassJson: (raw: string) => string[];
  parseConnectAuthorityStrict: (authority: string) => { host: string; port: number } | null;
  isBlockedConnectAddress: (address: string) => boolean;
  resolveConnectDestination: (
    host: string,
    port: number,
    lookup?: (
      hostname: string,
      options: { all: true; verbatim: true }
    ) => Promise<Array<{ address: string; family: number }>>
  ) => Promise<{ host: string; port: number; address: string; family: number }>;
};

const TARGETS = new Set(["daily-cloudcode-pa.googleapis.com", "api.githubcopilot.com"]);

test("DEFAULT_BYPASS_PATTERNS — at least the 4 mandatory regexes", () => {
  assert.ok(shim.DEFAULT_BYPASS_PATTERNS.length >= 4);
  for (const re of shim.DEFAULT_BYPASS_PATTERNS) {
    assert.ok(re instanceof RegExp);
  }
});

test("routeBypass — default bank pattern → bypass", () => {
  assert.equal(shim.routeBypass("my.bank.example", TARGETS, []), "bypass");
  assert.equal(shim.routeBypass("secure.bank.com", TARGETS, []), "bypass");
});

test("routeBypass — default gov pattern → bypass", () => {
  assert.equal(shim.routeBypass("portal.gov.br", TARGETS, []), "bypass");
  assert.equal(shim.routeBypass("tax.gov", TARGETS, []), "bypass");
});

test("routeBypass — default okta pattern → bypass", () => {
  assert.equal(shim.routeBypass("mycorp.okta.com", TARGETS, []), "bypass");
  assert.equal(shim.routeBypass("okta.com", TARGETS, []), "bypass");
});

test("routeBypass — default auth0 pattern → bypass", () => {
  assert.equal(shim.routeBypass("myapp.auth0.com", TARGETS, []), "bypass");
});

test("routeBypass — bypass beats target match (precedence)", () => {
  // Hypothetical: user has an okta-hosted Copilot account. Bypass wins.
  const targets = new Set(["my.okta.com"]);
  assert.equal(shim.routeBypass("my.okta.com", targets, []), "bypass");
});

test("routeBypass — known target hostname → target", () => {
  assert.equal(shim.routeBypass("daily-cloudcode-pa.googleapis.com", TARGETS, []), "target");
  assert.equal(shim.routeBypass("api.githubcopilot.com", TARGETS, []), "target");
});

test("routeBypass — unknown hostname → passthrough", () => {
  assert.equal(shim.routeBypass("example.com", TARGETS, []), "passthrough");
  assert.equal(shim.routeBypass("api.openai.com", TARGETS, []), "passthrough");
});

test("routeBypass — user glob pattern → bypass", () => {
  const userPatterns = ["*.internal.example.com"];
  assert.equal(shim.routeBypass("admin.internal.example.com", TARGETS, userPatterns), "bypass");
  assert.equal(shim.routeBypass("external.example.com", TARGETS, userPatterns), "passthrough");
});

test("routeBypass — empty hostname → passthrough", () => {
  assert.equal(shim.routeBypass("", TARGETS, []), "passthrough");
  assert.equal(shim.routeBypass(undefined as unknown as string, TARGETS, []), "passthrough");
});

test("routeBypass — targetHosts may be an array (not just Set)", () => {
  const targetsArr = ["daily-cloudcode-pa.googleapis.com", "api.githubcopilot.com"];
  assert.equal(shim.routeBypass("api.githubcopilot.com", targetsArr, []), "target");
  assert.equal(shim.routeBypass("example.com", targetsArr, []), "passthrough");
});

test("routeBypass — case-insensitive on hostname", () => {
  assert.equal(shim.routeBypass("MyApp.Okta.COM", TARGETS, []), "bypass");
  assert.equal(
    shim.routeBypass("DAILY-cloudcode-pa.googleapis.com".toLowerCase(), TARGETS, []),
    "target"
  );
});

test("bypassGlobMatch — exact match (no wildcard)", () => {
  assert.ok(shim.bypassGlobMatch("api.openai.com", "api.openai.com"));
  assert.ok(!shim.bypassGlobMatch("api.openai.com", "api.anthropic.com"));
});

test("bypassGlobMatch — single wildcard at start", () => {
  assert.ok(shim.bypassGlobMatch("foo.example.com", "*.example.com"));
  assert.ok(shim.bypassGlobMatch("bar.example.com", "*.example.com"));
  assert.ok(!shim.bypassGlobMatch("example.org", "*.example.com"));
});

test("bypassGlobMatch — wildcard at end", () => {
  assert.ok(shim.bypassGlobMatch("api.example.com", "api.*"));
  assert.ok(!shim.bypassGlobMatch("svc.example.com", "api.*"));
});

test("bypassGlobMatch — too many wildcards → rejected", () => {
  // 10 wildcards → segments.length === 11, exceeds the cap.
  const pat = "a*b*c*d*e*f*g*h*i*j*k";
  assert.equal(shim.bypassGlobMatch("abcdefghijk", pat), false);
});

test("bypassGlobMatch — case-insensitive", () => {
  assert.ok(shim.bypassGlobMatch("FOO.EXAMPLE.COM", "*.example.com"));
});

test("bypassGlobMatch — does not throw on regex-special chars in pattern", () => {
  // No regex compilation happens — the helper is a linear string walk.
  assert.doesNotThrow(() => shim.bypassGlobMatch("test.com", "(invalid["));
});

test("parseBypassJson — valid JSON with patterns array", () => {
  const raw = JSON.stringify({
    version: 1,
    patterns: ["*.internal.example.com", "Custom.Host.COM"],
  });
  const parsed = shim.parseBypassJson(raw);
  assert.deepEqual(parsed, ["*.internal.example.com", "custom.host.com"]);
});

test("parseBypassJson — empty input → []", () => {
  assert.deepEqual(shim.parseBypassJson(""), []);
});

test("parseBypassJson — malformed JSON → []", () => {
  assert.deepEqual(shim.parseBypassJson("not json"), []);
});

test("parseBypassJson — missing patterns property → []", () => {
  assert.deepEqual(shim.parseBypassJson(JSON.stringify({ version: 1 })), []);
});

test("parseBypassJson — patterns not an array → []", () => {
  assert.deepEqual(shim.parseBypassJson(JSON.stringify({ patterns: "foo" })), []);
});

test("parseBypassJson — filters out non-string and empty entries", () => {
  const raw = JSON.stringify({
    patterns: ["valid.com", "", null, 42, "Another.COM"],
  });
  const parsed = shim.parseBypassJson(raw);
  assert.deepEqual(parsed, ["valid.com", "another.com"]);
});

test("AP-ISS-0038 — CONNECT authority parsing is strict and IPv6-safe", () => {
  assert.deepEqual(shim.parseConnectAuthorityStrict("example.com:443"), {
    host: "example.com",
    port: 443,
  });
  assert.deepEqual(shim.parseConnectAuthorityStrict("[2001:4860:4860::8888]:443"), {
    host: "2001:4860:4860::8888",
    port: 443,
  });
  assert.equal(shim.parseConnectAuthorityStrict("example.com:not-a-port"), null);
  assert.equal(shim.parseConnectAuthorityStrict("example.com:0"), null);
  assert.equal(shim.parseConnectAuthorityStrict("user@example.com:443"), null);
  assert.equal(shim.parseConnectAuthorityStrict("example.com:443/path"), null);
});

test("AP-ISS-0038 — CONNECT blocks loopback, RFC1918, link-local, metadata and private IPv6", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.8",
    "172.16.4.5",
    "192.168.1.2",
    "169.254.169.254",
    "100.100.100.200",
    "::1",
    "fd00::1",
    "fe80::1",
  ]) {
    assert.equal(shim.isBlockedConnectAddress(address), true, address);
  }
  assert.equal(shim.isBlockedConnectAddress("1.1.1.1"), false);
  assert.equal(shim.isBlockedConnectAddress("2606:4700:4700::1111"), false);
});

test("AP-ISS-0038 — disallowed CONNECT ports fail before DNS resolution", async () => {
  let lookups = 0;
  await assert.rejects(
    shim.resolveConnectDestination("example.com", 22, async () => {
      lookups++;
      return [{ address: "93.184.216.34", family: 4 }];
    }),
    /CONNECT port 22 is not allowed/
  );
  assert.equal(lookups, 0);
});

test("AP-ISS-0038 — DNS answers are fail-closed and pinned to a public address", async () => {
  await assert.rejects(
    shim.resolveConnectDestination("mixed.example", 443, async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    /blocked private or special address/i
  );

  const resolved = await shim.resolveConnectDestination("public.example", 443, async () => [
    { address: "93.184.216.34", family: 4 },
  ]);
  assert.deepEqual(resolved, {
    host: "public.example",
    port: 443,
    address: "93.184.216.34",
    family: 4,
  });
});

test("C2 header contract — server.cjs intercept must inject x-omniroute-source and x-omniroute-agent", async () => {
  // This is a documentation/spec assertion: the exact header names that
  // server.cjs::intercept must inject per master plan §3.5. If anyone
  // edits server.cjs to remove or rename them, this test fails and
  // flags the regression.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const serverPath = path.resolve(here, "../../src/mitm/server.cjs");
  const src = fs.readFileSync(serverPath, "utf-8");
  assert.match(
    src,
    /"x-omniroute-source":\s*"agent-bridge"/,
    'server.cjs must inject "x-omniroute-source: agent-bridge"'
  );
  assert.match(
    src,
    /"x-omniroute-agent":\s*agentId/,
    'server.cjs must inject "x-omniroute-agent: <id>" from the host→agent map'
  );
  // Antigravity non-regression: the historical host must still resolve to
  // the antigravity agent id, so the existing flow continues to work.
  assert.match(
    src,
    /TARGET_HOST_AGENT\.set\(lower,\s*id\)/,
    "server.cjs must populate TARGET_HOST_AGENT from targets.json"
  );
  assert.match(
    src,
    /TARGET_HOST_AGENT\.set\(h,\s*"antigravity"\)/,
    "server.cjs must seed antigravity baseline in TARGET_HOST_AGENT"
  );
});

test("Hard Rule #12 — server.cjs intercept error path uses sanitizeErrorMessage", async () => {
  // Spec assertion: error responses must NOT leak raw err.message.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const serverPath = path.resolve(here, "../../src/mitm/server.cjs");
  const src = fs.readFileSync(serverPath, "utf-8");
  // sanitizeErrorMessage must wrap the error body.
  assert.match(
    src,
    /sanitizeErrorMessage\(error\s*&&\s*error\.message\)/,
    "intercept() error path must route through sanitizeErrorMessage()"
  );
  // The historical raw-leak pattern must be gone from the error body literal.
  const errorBodyRegion = src.match(
    /res\.end\(\s*JSON\.stringify\(\{\s*error[\s\S]*?type:\s*"mitm_error"[\s\S]*?\}\)\s*\)/
  );
  assert.ok(errorBodyRegion, "intercept() must build a JSON error body");
  assert.doesNotMatch(
    errorBodyRegion[0],
    /message:\s*error\.message[^a-zA-Z_]/,
    "intercept() error body must not contain raw error.message"
  );
});

test("C1 contract — server.cjs registers a CONNECT handler", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const serverPath = path.resolve(here, "../../src/mitm/server.cjs");
  const src = fs.readFileSync(serverPath, "utf-8");
  assert.match(src, /server\.on\(\s*"connect"/, "server.cjs must register a CONNECT handler");
  assert.match(
    src,
    /net\.connect\(/,
    "server.cjs must dial upstream via net.connect for bypass/passthrough"
  );
  assert.match(
    src,
    /HTTP\/1\.1\s+200\s+Connection Established/,
    "server.cjs CONNECT path must reply with 200 Connection Established"
  );
});

test("AP-ISS-0037 — default MITM listener is explicitly loopback-bound", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const serverPath = path.resolve(here, "../../src/mitm/server.cjs");
  const src = fs.readFileSync(serverPath, "utf-8");

  assert.match(
    src,
    /const\s+MITM_BIND_HOST\s*=\s*["']127\.0\.0\.1["']/,
    "server.cjs must define the default MITM bind host as IPv4 loopback"
  );
  assert.match(
    src,
    /server\.listen\(\s*LOCAL_PORT\s*,\s*MITM_BIND_HOST\s*,/,
    "server.cjs must pass the explicit loopback host to server.listen"
  );
});

test("R4 fix #5 — connection listener guards against double-count on re-emit", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const serverPath = path.resolve(here, "../../src/mitm/server.cjs");
  const src = fs.readFileSync(serverPath, "utf-8");
  // The CONNECT "target" branch calls server.emit("connection", clientSocket)
  // which re-enters the connection listener. Without a guard, activeConnections
  // would be double-incremented for the same socket.
  assert.match(
    src,
    /socket\.__mitmCounted/,
    "connection listener must use socket.__mitmCounted guard to prevent double-count on CONNECT target re-emit"
  );
  assert.match(
    src,
    /if\s*\(\s*socket\.__mitmCounted\s*\)\s*return/,
    "connection listener must early-return when socket is already counted"
  );
});

test("R4 fix #5 — CONNECT handler scope is documented", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const serverPath = path.resolve(here, "../../src/mitm/server.cjs");
  const src = fs.readFileSync(serverPath, "utf-8");
  // The CONNECT handler is documented as not exercised by the real DNS-spoof
  // flow (it only fires for HTTPS-proxy-tunneled-in-TLS clients). The doc
  // comment prevents future contributors from assuming it covers the primary
  // AgentBridge flow.
  assert.match(
    src,
    /HTTPS-proxy-tunneled-in-TLS|explicit HTTPS proxy/i,
    "CONNECT handler must carry a comment clarifying its real scope"
  );
});
