import assert from "node:assert/strict";
import test from "node:test";

import {
  findIdentityViolations,
  isHistoricalContentPath,
} from "../../../scripts/check/check-agentproxy-identity.mjs";

const oldProduct = ["Omni", "Route"].join("");
const oldEnv = ["OMNI", "ROUTE", "_TOKEN"].join("");
const oldScope = ["@", "omni", "route", "/plugin"].join("");

test("AP-ISS-0113 identity guard rejects former-base paths and active content", () => {
  const files = [
    "src/" + oldProduct.toLowerCase() + "Status.ts",
    "src/current.ts",
    "docs/reference/ENVIRONMENT.md",
  ];
  const content = new Map([
    ["src/" + oldProduct.toLowerCase() + "Status.ts", Buffer.from("export const ok = true;")],
    ["src/current.ts", Buffer.from("const label = " + JSON.stringify(oldProduct) + ";")],
    ["docs/reference/ENVIRONMENT.md", Buffer.from(oldEnv + "=1")],
  ]);

  const violations = findIdentityViolations(files, (file) => content.get(file) ?? Buffer.from(""));
  assert.ok(violations.some((item) => item.kind === "path"));
  assert.ok(violations.some((item) => item.kind === "content" && item.file === "src/current.ts"));
  assert.ok(
    violations.some(
      (item) => item.kind === "content" && item.file === "docs/reference/ENVIRONMENT.md"
    )
  );
});

test("AP-ISS-0113 identity guard permits AgentProxy identity and only explicit changelog history", () => {
  const files = [
    "src/current.ts",
    "README.md",
    "CHANGELOG.md",
    "docs/i18n/fr/CHANGELOG.md",
  ];
  const content = new Map([
    ["src/current.ts", Buffer.from("const label = 'AgentProxy'; const env = 'AGENTPROXY_TOKEN';")],
    ["README.md", Buffer.from("AgentProxy")],
    ["CHANGELOG.md", Buffer.from(oldProduct)],
    ["docs/i18n/fr/CHANGELOG.md", Buffer.from(oldScope)],
  ]);

  const violations = findIdentityViolations(files, (file) => content.get(file) ?? Buffer.from(""));
  assert.deepEqual(violations, []);
  assert.equal(isHistoricalContentPath("CHANGELOG.md"), true);
  assert.equal(isHistoricalContentPath("docs/i18n/fr/CHANGELOG.md"), true);
  assert.equal(isHistoricalContentPath("THIRD_PARTY_NOTICES.md"), false);
  assert.equal(isHistoricalContentPath("README.md"), false);

  const attributionViolations = findIdentityViolations(
    ["THIRD_PARTY_NOTICES.md"],
    () => Buffer.from(oldScope)
  );
  assert.equal(attributionViolations.length, 1);
});
