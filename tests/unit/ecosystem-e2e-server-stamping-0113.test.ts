import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const harnessSource = readFileSync(
  join(repoRoot, "scripts", "dev", "run-ecosystem-tests.mjs"),
  "utf8"
);

describe("ecosystem E2E harness (AP-ISS-0113)", () => {
  it("boots the peer-stamped custom server for open-mode auth semantics", () => {
    assert.ok(
      harnessSource.includes('"scripts/dev/run-next.mjs"'),
      "ecosystem harness must boot run-next.mjs so open-mode and peer stamping are applied"
    );
    assert.ok(
      !harnessSource.includes("run-next-playwright.mjs"),
      "bare Playwright/Next runner bypasses the custom server open-mode contract"
    );
  });

  it("pins the custom server bind host to loopback", () => {
    assert.ok(
      harnessSource.includes('HOST: process.env.HOST || "127.0.0.1"'),
      "open-mode auth requires loopback host classification"
    );
  });
});
