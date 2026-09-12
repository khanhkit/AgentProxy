import test from "node:test";
import assert from "node:assert/strict";

import { shouldStartApiBridge } from "../../src/lib/apiBridgeServer.ts";

test("API bridge is disabled when Rust core owns the API port", () => {
  assert.equal(
    shouldStartApiBridge({ AGENTPROXY_RUST_CORE: "1" }, { apiPort: 20128, dashboardPort: 20129 }),
    false
  );
});

test("API bridge still starts for legacy split-port mode", () => {
  assert.equal(shouldStartApiBridge({}, { apiPort: 20128, dashboardPort: 20129 }), true);
  assert.equal(shouldStartApiBridge({}, { apiPort: 20128, dashboardPort: 20128 }), false);
});
