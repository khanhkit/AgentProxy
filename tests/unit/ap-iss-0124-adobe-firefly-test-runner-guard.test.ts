import test from "node:test";
import assert from "node:assert/strict";

import { adobeFireflyBrowserEnabled } from "../../open-sse/services/adobeFireflySession.ts";

const KEYS = [
  "ADOBE_FIREFLY_BROWSER_REFRESH",
  "NODE_ENV",
  "VITEST",
  "NODE_TEST_CONTEXT",
] as const;

function withEnv(
  values: Partial<Record<(typeof KEYS)[number], string | undefined>>,
  fn: () => void
): void {
  const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const key of KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("AP-ISS-0124 Adobe browser warm stays disabled under node:test even when explicitly enabled", () => {
  withEnv(
    {
      ADOBE_FIREFLY_BROWSER_REFRESH: "1",
      NODE_ENV: undefined,
      VITEST: undefined,
      NODE_TEST_CONTEXT: "child-v8",
    },
    () => assert.equal(adobeFireflyBrowserEnabled(), false)
  );
});

test("AP-ISS-0124 Adobe browser warm stays disabled under NODE_ENV=test and Vitest", () => {
  withEnv(
    {
      ADOBE_FIREFLY_BROWSER_REFRESH: "1",
      NODE_ENV: "test",
      VITEST: undefined,
      NODE_TEST_CONTEXT: undefined,
    },
    () => assert.equal(adobeFireflyBrowserEnabled(), false)
  );
  withEnv(
    {
      ADOBE_FIREFLY_BROWSER_REFRESH: "1",
      NODE_ENV: undefined,
      VITEST: "true",
      NODE_TEST_CONTEXT: undefined,
    },
    () => assert.equal(adobeFireflyBrowserEnabled(), false)
  );
});

test("AP-ISS-0124 Adobe browser warm keeps production default and explicit kill switch semantics", () => {
  withEnv(
    {
      ADOBE_FIREFLY_BROWSER_REFRESH: undefined,
      NODE_ENV: "production",
      VITEST: undefined,
      NODE_TEST_CONTEXT: undefined,
    },
    () => assert.equal(adobeFireflyBrowserEnabled(), true)
  );
  withEnv(
    {
      ADOBE_FIREFLY_BROWSER_REFRESH: "0",
      NODE_ENV: "production",
      VITEST: undefined,
      NODE_TEST_CONTEXT: undefined,
    },
    () => assert.equal(adobeFireflyBrowserEnabled(), false)
  );
});
