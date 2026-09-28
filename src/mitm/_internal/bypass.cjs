/**
 * Bypass / passthrough routing primitives used by `src/mitm/server.cjs`.
 *
 * This file exists because:
 *   - `server.cjs` runs as a standalone CommonJS process and cannot import
 *     the ESM/TS source of `src/mitm/passthrough.ts` or
 *     `src/mitm/targets/index.ts`.
 *   - We still want unit tests to cover the bypass/passthrough decision
 *     without spawning the actual TLS server (which would require certs and
 *     ROUTER_API_KEY).
 *
 * Defaults MUST mirror `DEFAULT_BYPASS_PATTERNS` in
 * `src/mitm/passthrough.ts`. User bypass patterns are produced by
 * `src/mitm/manager.ts::writeBypassJson` and loaded by `server.cjs` at
 * boot from `<DATA_DIR>/mitm/bypass.json`.
 *
 * Plan reference:
 *   - 11-agent-bridge.plan.md §4.6 (passthrough/bypass)
 *   - master-plan-group-A.md §3.5 (header injection contract)
 *   - master-plan-group-A.md §12 #16 (passthrough acceptance criterion)
 */

"use strict";

const dns = require("node:dns");
const net = require("node:net");

// Default bypass patterns — banks, governments, SSO providers. Must stay in
// sync with src/mitm/passthrough.ts::DEFAULT_BYPASS_PATTERNS.
const DEFAULT_BYPASS_PATTERNS = [
  /\.bank\./i,
  /(^|\.)gov(\.|$)/i,
  /(^|\.)okta\.com$/i,
  /(^|\.)auth0\.com$/i,
];

/**
 * Match a hostname against a simple glob pattern (only `*` wildcard).
 * Linear, ReDoS-safe — mirrors `globMatch` in src/mitm/passthrough.ts.
 *
 * @param {string} hostname
 * @param {string} pattern
 * @returns {boolean}
 */
function bypassGlobMatch(hostname, pattern) {
  const segments = String(pattern).toLowerCase().split("*");
  if (segments.length > 9) return false;
  const h = String(hostname).toLowerCase();
  if (segments.length === 1) return h === segments[0];
  const first = segments[0];
  if (first && !h.startsWith(first)) return false;
  const last = segments[segments.length - 1];
  if (last && !h.endsWith(last)) return false;
  let pos = first.length;
  for (let i = 1; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (seg === "") continue;
    const idx = h.indexOf(seg, pos);
    if (idx === -1) return false;
    pos = idx + seg.length;
  }
  if (last) {
    const minEnd = pos + last.length;
    if (minEnd > h.length) return false;
  }
  return true;
}

/**
 * Decide what to do with a connection (CONNECT or direct TLS) to `hostname`.
 * Returns one of:
 *   - "bypass": tunnel without TLS decrypt; never log body/headers.
 *   - "target": hostname matches the AgentBridge target set — proceed with
 *     local TLS termination.
 *   - "passthrough": neither bypass nor target — transparent TCP tunnel.
 *
 * Precedence matches `src/mitm/targets/index.ts::routeConnection`:
 *   bypass > target > passthrough
 *
 * @param {string} hostname
 * @param {Iterable<string>} targetHosts - set/array of known target hosts
 * @param {string[]} userBypassPatterns - lowercased user glob strings
 * @returns {"bypass" | "target" | "passthrough"}
 */
function routeBypass(hostname, targetHosts, userBypassPatterns) {
  if (!hostname) return "passthrough";
  const h = String(hostname).toLowerCase();
  if (DEFAULT_BYPASS_PATTERNS.some((re) => re.test(h))) return "bypass";
  const patterns = Array.isArray(userBypassPatterns) ? userBypassPatterns : [];
  if (patterns.some((p) => bypassGlobMatch(h, p))) return "bypass";
  // targetHosts may be a Set, an array, or any iterable with `.has` semantics.
  if (targetHosts && typeof targetHosts.has === "function") {
    if (targetHosts.has(h)) return "target";
  } else if (Array.isArray(targetHosts)) {
    if (targetHosts.includes(h)) return "target";
  }
  return "passthrough";
}

/**
 * Parse a `bypass.json` file content blob into an array of lowercased user
 * glob patterns. Pure function — no fs I/O — so this shim stays free of any
 * path-traversal surface (CWE-22). The actual file read lives in
 * `server.cjs`, which knows the trusted, pre-resolved file path.
 *
 * Returns [] when the input is missing or malformed — the proxy must keep
 * working even when the user has never customized the bypass list.
 *
 * @param {string} raw - file contents (utf-8 JSON) or empty string
 * @returns {string[]}
 */
function parseBypassJson(raw) {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.patterns)) return [];
    return parsed.patterns
      .filter((p) => typeof p === "string" && p.length > 0)
      .map((p) => p.toLowerCase());
  } catch {
    return [];
  }
}

/**
 * True if `ip` is an IPv4 or IPv6 loopback address. (Gap 14 helper.)
 * @param {string} ip
 * @returns {boolean}
 */
function isLoopbackIp(ip) {
  if (typeof ip !== "string") return false;
  if (ip === "::1" || ip === "::ffff:127.0.0.1") return true;
  return /^127\./.test(ip);
}

/**
 * Defense-in-depth loop guard (Gap 14). The primary guard is the
 * x-agentproxy-source header; this is a structural backstop. If a forwarded
 * request's resolved upstream is a loopback address on the MITM server's own
 * listen port, dialing it would re-enter this same server — an infinite loop /
 * fd storm. Callers should refuse instead of dialing themselves.
 *
 * @param {string} targetIp - resolved upstream IP
 * @param {number} destPort - the port we would dial upstream
 * @param {number} localPort - this MITM server's own listen port
 * @returns {boolean}
 */
function isSelfLoopDestination(targetIp, destPort, localPort) {
  return isLoopbackIp(targetIp) && Number(destPort) === Number(localPort);
}

const CONNECT_ALLOWED_PORTS = new Set([443]);
const CONNECT_BLOCKLIST = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  CONNECT_BLOCKLIST.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  CONNECT_BLOCKLIST.addSubnet(network, prefix, "ipv6");
}

function normalizeConnectHost(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
}

/**
 * Strictly parse a CONNECT authority without silently repairing malformed ports.
 * A missing port keeps the historical HTTPS default (443); malformed explicit
 * ports are rejected instead of falling back to 443.
 *
 * @param {string} authority
 * @returns {{host:string, port:number}|null}
 */
function parseConnectAuthorityStrict(authority) {
  if (typeof authority !== "string") return null;
  const raw = authority.trim();
  if (!raw || raw.length > 512 || /[\s/@?#]/.test(raw)) return null;

  let host = "";
  let rawPort = "";
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    if (end <= 1) return null;
    host = raw.slice(1, end);
    const suffix = raw.slice(end + 1);
    if (!suffix.startsWith(":")) return null;
    rawPort = suffix.slice(1);
    if (!rawPort || rawPort.includes(":")) return null;
  } else {
    const firstColon = raw.indexOf(":");
    const lastColon = raw.lastIndexOf(":");
    if (firstColon !== lastColon) return null;
    if (firstColon === -1) {
      host = raw;
      rawPort = "443";
    } else {
      host = raw.slice(0, firstColon);
      rawPort = raw.slice(firstColon + 1);
    }
  }

  host = normalizeConnectHost(host);
  if (!host || host.length > 253 || /[\[\]]/.test(host)) return null;
  if (!/^\d+$/.test(rawPort)) return null;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

function isBlockedConnectHostname(hostname) {
  const host = normalizeConnectHost(hostname);
  return (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.goog" ||
    host === "metadata.google.internal"
  );
}

/** Public-only verdict for a resolved CONNECT destination address. */
function isBlockedConnectAddress(address) {
  const value = String(address || "").trim();
  if (/^::ffff:/i.test(value)) return true;
  const family = net.isIP(value);
  if (family === 4) return CONNECT_BLOCKLIST.check(value, "ipv4");
  if (family === 6) return CONNECT_BLOCKLIST.check(value, "ipv6");
  return true;
}

/**
 * Resolve and pin a raw CONNECT destination before any upstream socket exists.
 * Every DNS answer must be public. Rejecting mixed public/private answer sets
 * prevents an attacker-controlled hostname from using DNS ordering/rebinding to
 * steer the later TCP dial onto an internal address.
 *
 * @param {string} host
 * @param {number} port
 * @param {(hostname:string, options:{all:true,verbatim:true}) => Promise<Array<{address:string,family:number}>>} [lookup]
 */
async function resolveConnectDestination(
  host,
  port,
  lookup = (hostname, options) => dns.promises.lookup(hostname, options)
) {
  const normalizedHost = normalizeConnectHost(host);
  if (!CONNECT_ALLOWED_PORTS.has(Number(port))) {
    throw new Error(`CONNECT port ${port} is not allowed`);
  }
  if (isBlockedConnectHostname(normalizedHost)) {
    throw new Error(`CONNECT destination ${normalizedHost || "<empty>"} is blocked`);
  }

  const literalFamily = net.isIP(normalizedHost);
  if (literalFamily !== 0) {
    if (isBlockedConnectAddress(normalizedHost)) {
      throw new Error(
        `CONNECT destination resolved to blocked private or special address: ${normalizedHost}`
      );
    }
    return {
      host: normalizedHost,
      port: Number(port),
      address: normalizedHost,
      family: literalFamily,
    };
  }

  let answers;
  try {
    answers = await lookup(normalizedHost, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(
      `CONNECT destination DNS lookup failed: ${error && error.message ? error.message : error}`
    );
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error("CONNECT destination DNS lookup returned no addresses");
  }

  for (const answer of answers) {
    if (!answer || !answer.address || isBlockedConnectAddress(answer.address)) {
      throw new Error(
        `CONNECT destination resolved to blocked private or special address: ${answer && answer.address ? answer.address : "<invalid>"}`
      );
    }
  }

  const first = answers[0];
  return {
    host: normalizedHost,
    port: Number(port),
    address: first.address,
    family: Number(first.family) || net.isIP(first.address),
  };
}

/**
 * Parse the MITM_VERBOSE env var into a routing-decision log level (Gap 15).
 * Default 1 (log decisions) preserves existing behavior; 0 silences; higher
 * levels are reserved for finer detail. Garbage falls back to the default.
 *
 * @param {string|undefined} envValue
 * @returns {number}
 */
function parseVerboseLevel(envValue) {
  const n = Number.parseInt(envValue, 10);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

module.exports = {
  DEFAULT_BYPASS_PATTERNS,
  bypassGlobMatch,
  routeBypass,
  parseBypassJson,
  isLoopbackIp,
  isSelfLoopDestination,
  parseConnectAuthorityStrict,
  isBlockedConnectAddress,
  resolveConnectDestination,
  parseVerboseLevel,
};
