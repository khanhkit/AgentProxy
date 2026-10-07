import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const VERIFIERS = [
  "src/shared/utils/apiAuth.ts",
  "src/server/authz/pipeline.ts",
  "src/server/ws/liveServer.ts",
  "src/lib/ws/handshake.ts",
  "src/app/api/auth/status/route.ts",
  "src/app/api/settings/require-login/route.ts",
];

for (const rel of VERIFIERS) {
  test(rel + " verifies dashboard sessions through the shared verifier", () => {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.match(src, /verifyDashboardSessionToken/);
    assert.doesNotMatch(src, /jwtVerify\s*\(\s*token\s*,/);
  });
}

test("shared verifier pins HS256 and authenticated claim", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "src/shared/utils/dashboardSessionToken.ts"),
    "utf8"
  );
  assert.match(src, /algorithms:\s*\["HS256"\]/);
  assert.match(src, /DASHBOARD_SESSION_CLAIM/);
  assert.match(src, /DASHBOARD_SESSION_CLAIM\] !== true/);
});
