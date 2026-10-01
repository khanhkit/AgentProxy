import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { resolveElectronDashboardUrl } from "../../scripts/dev/run-electron-dev.mjs";

const root = process.cwd();

test("electron dev waits for the configured dashboard port without shell-specific expansion", () => {
  assert.equal(resolveElectronDashboardUrl({ PORT: "37128" }), "http://127.0.0.1:37128");
  assert.equal(
    resolveElectronDashboardUrl({
      PORT: "37128",
      API_PORT: "37128",
      DASHBOARD_PORT: "38128",
    }),
    "http://127.0.0.1:38128"
  );

  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(
    pkg.scripts["electron:dev"],
    'concurrently "npm run dev" "node scripts/dev/run-electron-dev.mjs"'
  );
  assert.ok(!pkg.scripts["electron:dev"].includes("localhost:20128"));
  assert.ok(!pkg.scripts["electron:dev"].includes("${PORT"));
});

test("MITM standalone router fallback derives from API_PORT/PORT and normalizes /v1 once", () => {
  const source = fs.readFileSync(path.join(root, "src/mitm/server.cjs"), "utf8");
  assert.match(source, /process\.env\.API_PORT \|\| process\.env\.PORT \|\| 20128/);
  assert.match(source, /replace\(\/\\\/v1\$\/i, ""\)/);
  assert.doesNotMatch(source, /OMNIROUTE_BASE_URL \|\|[\s\S]{0,120}"http:\/\/localhost:20128"/);
});
