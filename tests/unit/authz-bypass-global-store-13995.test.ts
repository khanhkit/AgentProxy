import test from "node:test";
import assert from "node:assert/strict";
import { getAuthzBypassSnapshot } from "../../src/lib/config/runtimeSettings.ts";

const GLOBAL_KEY = "__omniroute_authzBypass_config__";

test("authz bypass accessor reads the shared global store", () => {
  const root = globalThis as typeof globalThis & Record<string, unknown>;
  const previous = root[GLOBAL_KEY];

  try {
    root[GLOBAL_KEY] = { enabled: false, prefixes: ["/api/custom/"] };
    assert.deepEqual(getAuthzBypassSnapshot(), {
      enabled: false,
      prefixes: ["/api/custom/"],
    });
  } finally {
    if (previous === undefined) delete root[GLOBAL_KEY];
    else root[GLOBAL_KEY] = previous;
  }
});
