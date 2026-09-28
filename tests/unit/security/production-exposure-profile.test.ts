import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const PROD_COMPOSE = fs.readFileSync("docker-compose.prod.yml", "utf8");
const PROFILE_DOC_PATH = "docs/security/PRODUCTION_EXPOSURE.md";

test("AP-ISS-0012: production compose publishes HTTP/WS ports on loopback by default", () => {
  assert.match(
    PROD_COMPOSE,
    /\$\{PROD_BIND_HOST:-127\.0\.0\.1\}:\$\{PROD_DASHBOARD_PORT:-20130\}:\$\{DASHBOARD_PORT:-\$\{PORT:-20128\}\}/
  );
  assert.match(
    PROD_COMPOSE,
    /\$\{PROD_BIND_HOST:-127\.0\.0\.1\}:\$\{PROD_API_PORT:-20131\}:\$\{API_PORT:-20129\}/
  );
  assert.match(
    PROD_COMPOSE,
    /\$\{PROD_BIND_HOST:-127\.0\.0\.1\}:\$\{PROD_LIVE_WS_PORT:-20132\}:\$\{LIVE_WS_PORT:-20132\}/
  );
});

test("AP-ISS-0012: production exposure guide makes the public trust boundary explicit", () => {
  assert.equal(fs.existsSync(PROFILE_DOC_PATH), true, `${PROFILE_DOC_PATH} must exist`);
  const guide = fs.readFileSync(PROFILE_DOC_PATH, "utf8");

  for (const required of [
    "PROD_BIND_HOST",
    "REQUIRE_API_KEY=true",
    "AUTH_COOKIE_SECURE=true",
    "STORAGE_ENCRYPTION_KEY",
    "NEXT_PUBLIC_BASE_URL",
    "AGENTPROXY_TRUST_PROXY",
    "AGENTPROXY_ALLOW_LOCAL_PROVIDER_URLS=false",
    "/healthz",
    "peer stamp",
    "TLS",
    "keyless",
  ]) {
    assert.ok(guide.includes(required), `production exposure guide must document ${required}`);
  }

  assert.match(guide, /trusted network/i);
  assert.match(guide, /reverse proxy|tunnel/i);
  assert.match(guide, /do not expose[^\n]*(directly|internet)/i);
});

test("AP-ISS-0012: public health response remains coarse lifecycle text", async () => {
  const route = await import("../../../src/app/healthz/route.ts");
  const response = route.GET();
  const body = await response.text();

  assert.ok(["ok\n", "starting\n", "stopping\n"].includes(body));
  assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.ok(body.length <= "stopping\n".length);
  assert.doesNotMatch(body, /provider|account|credential|secret|setting|stack|error/i);
});
