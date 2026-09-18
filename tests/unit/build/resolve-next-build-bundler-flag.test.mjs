import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveNextBuildBundlerFlag } from "../../../scripts/build/build-next-isolated.mjs";

test("resolveNextBuildBundlerFlag returns --turbopack by default", () => {
  const flag = resolveNextBuildBundlerFlag({});
  assert.equal(flag, "--turbopack");
});

test("resolveNextBuildBundlerFlag returns --webpack when AGENTPROXY_USE_TURBOPACK is '0'", () => {
  const flag = resolveNextBuildBundlerFlag({ AGENTPROXY_USE_TURBOPACK: "0" });
  assert.equal(flag, "--webpack");
});

test("resolveNextBuildBundlerFlag returns --turbopack when AGENTPROXY_USE_TURBOPACK is '1'", () => {
  const flag = resolveNextBuildBundlerFlag({ AGENTPROXY_USE_TURBOPACK: "1" });
  assert.equal(flag, "--turbopack");
});
