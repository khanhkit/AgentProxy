import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/shared/components/TraeAuthModal.tsx", "utf8");

test("Trae browser auth opens the popup before awaiting server-issued callback state", () => {
  const handler = source.match(
    /const handleAuthorizeWithBrowser = [\s\S]*?\n  };\n\n  const handleImportToken/
  );
  assert.ok(handler, "expected Trae browser authorization handler");

  const body = handler![0];
  const popupIndex = body.indexOf('window.open("about:blank"');
  const stateFetchIndex = body.indexOf('fetch("/api/oauth/trae/authorize-state"');
  assert.ok(popupIndex >= 0, "browser flow must open a blank popup synchronously");
  assert.ok(stateFetchIndex >= 0, "browser flow must request server-issued callback state");
  assert.ok(
    popupIndex < stateFetchIndex,
    "popup must open before the async state request so browser user activation is preserved"
  );
});

test("Trae browser auth uses server-issued state as login_trace_id authority", () => {
  assert.doesNotMatch(
    source,
    /const traceId = uuid\(\)/,
    "client-generated UUID must not be the authoritative callback state"
  );
  assert.match(source, /traceIdRef\.current = state;/);
  assert.match(source, /buildTraeAuthorizeUrl\(callbackUrl, state\)/);
  assert.match(source, /popup\.location\.href = authUrl;/);
});
