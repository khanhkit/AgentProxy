import assert from "node:assert/strict";
import test from "node:test";

import { getBaseUrl } from "../../src/lib/wellKnown.ts";

test("getBaseUrl derives the no-request fallback from PORT", () => {
  const originalPort = process.env.PORT;
  const originalDashboardPort = process.env.DASHBOARD_PORT;
  const originalBaseUrl = process.env.OMNIROUTE_BASE_URL;
  const originalGenericBaseUrl = process.env.BASE_URL;
  const originalPublicBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  process.env.PORT = "37128";
  delete process.env.DASHBOARD_PORT;
  delete process.env.OMNIROUTE_BASE_URL;
  delete process.env.BASE_URL;
  delete process.env.NEXT_PUBLIC_BASE_URL;

  try {
    assert.equal(getBaseUrl(null), "http://localhost:37128");
  } finally {
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
    if (originalDashboardPort === undefined) delete process.env.DASHBOARD_PORT;
    else process.env.DASHBOARD_PORT = originalDashboardPort;
    if (originalBaseUrl === undefined) delete process.env.OMNIROUTE_BASE_URL;
    else process.env.OMNIROUTE_BASE_URL = originalBaseUrl;
    if (originalGenericBaseUrl === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = originalGenericBaseUrl;
    if (originalPublicBaseUrl === undefined) delete process.env.NEXT_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_BASE_URL = originalPublicBaseUrl;
  }
});
