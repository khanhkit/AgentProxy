import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Point the data dir at a throwaway location BEFORE importing the route so we can assert
// the validate-only route never writes the persisted CA-path file. resolveMitmDataDir()
// reads DATA_DIR at call time, so this also governs the route under test.
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-ca-datadir-"));
process.env.DATA_DIR = DATA_DIR;
// The persisted path used by the real (persisting) POST /upstream-ca route.
const PERSISTED_CA_PATH_FILE = path.join(DATA_DIR, "mitm", "upstream-ca.path");

const { POST } = await import("../../src/app/api/tools/agent-bridge/upstream-ca/test/route.ts");

// #3488 — UpstreamCaField's "Test" button POSTed to /api/tools/agent-bridge/upstream-ca/test,
// which did not exist (404). The new validate-only route checks the CA file exists and is a
// parseable PEM certificate WITHOUT persisting/activating it.

// A throwaway self-signed cert (CN=AgentProxy Test CA), valid to 2036.
const TEST_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIDGzCCAgOgAwIBAgIUQwW3KswP/AFU12XKuwoHmf1euKAwDQYJKoZIhvcNAQEL
BQAwHTEbMBkGA1UEAwwSQWdlbnRQcm94eSBUZXN0IENBMB4XDTI2MDkyMDA2MzE1
MloXDTM2MDkxNzA2MzE1MlowHTEbMBkGA1UEAwwSQWdlbnRQcm94eSBUZXN0IENB
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhNc1H+UQpnIVbux2tfmH
1GC6xm6pfd7sfTRWT+AxgHW2ceIOu+l+rBDsWH4wJ6HM2NZJv+LxnpvyjBzaa9Gw
I/YfQ76TLg6DGHqWt/ywcEt6oc58/k1ULL7Klrtr/wDsnpgrjgBjm+7UdiTD0d0g
thMsm7Hvqhb7hQMWcewmo3Wvn5GT1cK6ILPaN09Xmg9eQKPgXQWrzLDm4XwC1um9
AXAnLn1uQesyoF0AtClWu25cr1D8+x2s2NcBDw9SY4R9/riiGeSG4gn0Ij+AlK/e
2/CF8D1FI/0HQH+DSPmKt1N4sv6N+BJfrepss5Y9Nv1uy+wKOVN2A7JLm0wXYEAv
uQIDAQABo1MwUTAdBgNVHQ4EFgQU27WM1/nSxSfgdiG+K3Yi0idhlncwHwYDVR0j
BBgwFoAU27WM1/nSxSfgdiG+K3Yi0idhlncwDwYDVR0TAQH/BAUwAwEB/zANBgkq
hkiG9w0BAQsFAAOCAQEAQJl73Lv06SecjnoY0MsCix2bO5JWBYEFWsbDu68V01DI
Rv7oeFMgOVXpClTdzEVN/yR6bmIwqsJ/ZyUf9BiVYpiPtXFeojssW1L8wlsRYKub
d5w9RTGzfZgw3pVg8KHzKlEzk09EbstS/SoA7zojkxnpAvgKNZFlnOhEo+9W1Ucu
DmrUecICIKfXqfFW5D2/FdpalU0L/xadkSS/8rkmK2WCAtYgcobaGJ6D1AShZe07
7tBzjXqyyHuY2OPftj96M898va2WyXiyxmHWUFJCftTyak+EbXyOlHCf+LQaL+Rl
MWesfb5FPiDsDMOf3M+9+Fb4B61ADiNJc5bZhXLXCA==
-----END CERTIFICATE-----
`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-ca-test-"));
const validCaPath = path.join(dir, "valid-ca.pem");
const nonPemPath = path.join(dir, "not-a-cert.txt");
fs.writeFileSync(validCaPath, TEST_CA_PEM);
fs.writeFileSync(nonPemPath, "this is not a certificate");

test.after(() => {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.rmSync(DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function postJson(body: unknown): Request {
  return new Request("http://localhost/api/tools/agent-bridge/upstream-ca/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("#3488 valid PEM cert → 200 ok with subject", async () => {
  const res = await POST(postJson({ path: validCaPath }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.match(json.subject, /AgentProxy Test CA/);
});

test("#3488 does NOT persist the CA path (validate-only)", async () => {
  // Real side-effect guard (#3821-review LEDGER-11): the persisting POST /upstream-ca
  // route writes <dataDir>/mitm/upstream-ca.path. After a successful /test call that file
  // must NOT exist — proving the dry-run never persisted/activated the CA.
  assert.ok(
    !fs.existsSync(PERSISTED_CA_PATH_FILE),
    "precondition: persisted CA-path file should not exist before the test"
  );

  const res = await POST(postJson({ path: validCaPath }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);

  assert.ok(
    !fs.existsSync(PERSISTED_CA_PATH_FILE),
    "validate-only /test route must not write the persisted upstream-ca.path file"
  );
  // And it must not advertise activation/persistence in its response shape.
  assert.equal(json.persisted, undefined);
  assert.equal(json.activated, undefined);
});

test("#3488 non-existent path → 400", async () => {
  const res = await POST(postJson({ path: path.join(dir, "nope.pem") }));
  assert.equal(res.status, 400);
});

test("#3488 file that is not a PEM cert → 400", async () => {
  const res = await POST(postJson({ path: nonPemPath }));
  assert.equal(res.status, 400);
});

test("#3488 invalid body (missing path) → 400", async () => {
  const res = await POST(postJson({}));
  assert.equal(res.status, 400);
});

test("#3488 invalid JSON body → 400", async () => {
  const req = new Request("http://localhost/api/tools/agent-bridge/upstream-ca/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
});
