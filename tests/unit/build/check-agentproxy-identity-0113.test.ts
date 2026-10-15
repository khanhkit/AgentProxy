import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { findIdentityViolations } from "../../../scripts/check/check-agentproxy-identity.mjs";

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

test("AP-ISS-0171 identity guard treats changelogs as active product docs", () => {
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
  assert.equal(
    violations.filter((item) => item.kind === "content" && item.file === "CHANGELOG.md").length,
    1
  );
  assert.equal(
    violations.filter(
      (item) => item.kind === "content" && item.file === "docs/i18n/fr/CHANGELOG.md"
    ).length,
    1
  );
  const attributionViolations = findIdentityViolations(
    ["THIRD_PARTY_NOTICES.md"],
    () => Buffer.from(oldScope)
  );
  assert.equal(attributionViolations.length, 1);
});

test("AP-ISS-0171 package scripts expose one canonical verification command", () => {
  const packageJson = readFileSync("package.json", "utf8");
  const canonicalVerifyKey = JSON.stringify("agentproxy:verify");
  const occurrences = packageJson.split(canonicalVerifyKey).length - 1;

  assert.equal(occurrences, 1, "identity cleanup must not collapse a legacy alias into a duplicate key");
});
