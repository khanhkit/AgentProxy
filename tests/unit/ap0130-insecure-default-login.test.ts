import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";

/**
 * Regression test for issue #13679 (PR D, item #5) — deploy manifests
 * (`contrib/podman/agentproxy.container`, `.env.example`) ship the well-known
 * placeholder `INITIAL_PASSWORD=CHANGEME`. `ensurePersistentManagementPasswordHash()`
 * already warns loudly on boot when the bootstrap password is this literal, but it
 * does NOT stop a remote attacker who simply tries the well-known default from
 * logging in over the network — only a local console warning fires.
 *
 * Fix: `/api/auth/login` now refuses a successful password match against a
 * known-insecure default (e.g. "CHANGEME") when the request does not originate
 * from loopback, forcing the operator to log in from localhost and rotate the
 * password before the dashboard is reachable from the network with the
 * default credential.
 */

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-13679d-"));
process.env.DATA_DIR = TEST_DATA_DIR;
process.env.JWT_SECRET = "test-jwt-secret-13679d";

const ORIGINAL_INITIAL_PASSWORD = process.env.INITIAL_PASSWORD;
const ORIGINAL_STAMP_TOKEN = process.env.AGENTPROXY_PEER_STAMP_TOKEN;
process.env.AGENTPROXY_PEER_STAMP_TOKEN = "ap0130-login-peer-stamp";

const core = await import("../../src/lib/db/core.ts");
const { updateSettings } = await import("../../src/lib/db/settings.ts");
const compliance = await import("../../src/lib/compliance/index.ts");
const loginRoute = await import("../../src/app/api/auth/login/route.ts");
const DEFAULT_HASH = bcrypt.hashSync("CHANGEME", 4);

const originalGetCookieStore = loginRoute.authRouteInternals.getCookieStore;

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  process.env.INITIAL_PASSWORD = "CHANGEME";
}

test.beforeEach(async () => {
  await resetStorage();
  await updateSettings({ password: DEFAULT_HASH, setupComplete: true, requireLogin: true });
  loginRoute.authRouteInternals.getCookieStore = async () => ({ set() {} });
});

test.afterEach(() => {
  loginRoute.authRouteInternals.getCookieStore = originalGetCookieStore;
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (ORIGINAL_INITIAL_PASSWORD === undefined) {
    delete process.env.INITIAL_PASSWORD;
  } else {
    process.env.INITIAL_PASSWORD = ORIGINAL_INITIAL_PASSWORD;
  }
  if (ORIGINAL_STAMP_TOKEN === undefined) delete process.env.AGENTPROXY_PEER_STAMP_TOKEN;
  else process.env.AGENTPROXY_PEER_STAMP_TOKEN = ORIGINAL_STAMP_TOKEN;
});

function postLogin(password: string, peerIp: string) {
  const loopback = peerIp === "127.0.0.1";
  return loginRoute.POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": loopback ? "203.0.113.88" : "127.0.0.1",
        "x-agentproxy-trusted-peer-ip": peerIp,
        "x-agentproxy-peer-locality": loopback ? "loopback" : "remote",
      },
      body: JSON.stringify({ password }),
    })
  );
}

test("a public-IP login with the well-known default password CHANGEME is rejected", async () => {
  const response = await postLogin("CHANGEME", "203.0.113.77");

  assert.equal(
    response.status,
    403,
    "a remote attacker guessing the well-known default INITIAL_PASSWORD must not be able to " +
      "authenticate — only a console warning fires today, which is not a real control"
  );
  assert.equal(response.headers.get("set-cookie"), null, "no session cookie must be issued");

  const [entry] = compliance.getAuditLog({
    action: "auth.login.insecure_default_blocked",
    limit: 1,
  });
  assert.ok(
    entry,
    "expected an auth.login.insecure_default_blocked audit entry for the blocked attempt"
  );
});

test("a loopback login with the well-known default password CHANGEME still succeeds", async () => {
  const response = await postLogin("CHANGEME", "127.0.0.1");

  assert.equal(
    response.status,
    200,
    "the operator must still be able to bootstrap/rotate the password from loopback"
  );
  const body = await response.json();
  assert.equal(body.success, true);
});

test("a public-IP login with a non-default (rotated) password still succeeds", async () => {
  const rotated = "a-real-rotated-password-13679d";
  process.env.INITIAL_PASSWORD = rotated;
  await updateSettings({ password: bcrypt.hashSync(rotated, 4) });
  const response = await postLogin(rotated, "203.0.113.77");

  assert.equal(
    response.status,
    200,
    "the insecure-default check must not block legitimate remote logins once the password " +
      "has actually been rotated away from the well-known default"
  );
});
