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
  assert.equal(
    violations.filter((item) => item.file === "src/current.ts").length,
    0,
    "canonical AgentProxy source must stay accepted"
  );
  assert.equal(
    violations.filter((item) => item.file === "README.md").length,
    0,
    "canonical AgentProxy product docs must stay accepted"
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


test("AP-ISS-0171 OCR regression: canonical CLI env keys are unique", () => {
  const source = readFileSync("bin/cli/commands/env.mjs", "utf8");
  const arrayBody = source.match(/const AGENTPROXY_ENV_VARS = \[([\s\S]*?)\];/u)?.[1];
  assert.ok(arrayBody, "CLI canonical env list must exist");
  const entries = [...arrayBody.matchAll(/"([A-Z][A-Z0-9_]*)"/gu)].map((match) => match[1]);
  assert.equal(new Set(entries).size, entries.length, "env show must not iterate duplicate keys");
});

test("AP-ISS-0171 OCR regression: Japanese UI must use AgentProxy branding", () => {
  const messages = readFileSync("src/i18n/messages/ja.json", "utf8");
  const legacyBrand = ["オムニ", "ルート"].join("");
  assert.equal(messages.includes(legacyBrand), false, "old brand must not render in Japanese UI");
});

test("AP-ISS-0171 OCR regression: cache header fallback does not repeat canonical lookup", () => {
  const source = readFileSync("open-sse/services/cache/semanticCacheManager.ts", "utf8");
  assert.doesNotMatch(source, /getHeader\(headers, `x-agentproxy-cache-\$\{suffix\}`\)\s*\?\?\s*getHeader\(headers, `x-agentproxy-cache-\$\{suffix\}`\)/u);
  assert.doesNotMatch(source, /getHeader\(headers, "x-agentproxy-no-cache"\)\s*\?\?\s*getHeader\(headers, "x-agentproxy-no-cache"\)/u);
});


test("AP-ISS-0171 OCR regression: OpenAPI never advertises a fake canonical legacy alias", () => {
  const source = readFileSync("docs/openapi.yaml", "utf8");
  assert.doesNotMatch(source, /The legacy x-agentproxy-config-api-key header remains a migration alias\./u);
  assert.match(source, /x-agentproxy-config-api-key/u);
});
