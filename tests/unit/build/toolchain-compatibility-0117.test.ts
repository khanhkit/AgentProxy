import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  TOOLCHAIN,
  authoritativeNpmSupportsNode,
} from "../../../scripts/check/check-toolchain-contract.mjs";

test("AP-0117 default Node is accepted by authoritative npm 12.0.2", () => {
  assert.equal(
    authoritativeNpmSupportsNode(TOOLCHAIN.defaultNode),
    true,
    `npm 12.0.2 requires ${TOOLCHAIN.npmNodeEngine}; got default Node ${TOOLCHAIN.defaultNode}`
  );
});

test("AP-0117 keeps Node 25 as runtime compatibility without forcing npm 12", () => {
  assert.ok(TOOLCHAIN.compatibilityNodes.includes("25.0.0"));
  assert.ok(TOOLCHAIN.bundledNpmCompatibilityNodes.includes("25.0.0"));
  assert.equal(authoritativeNpmSupportsNode("25.0.0"), false);

  const workflow = readFileSync(".github/workflows/nightly-compat.yml", "utf8");
  const action = readFileSync(".github/actions/npm-ci-retry/action.yml", "utf8");

  assert.match(workflow, /node:\s*"25\.0\.0"[\s\S]*pin_authoritative_npm:\s*"false"/);
  assert.match(action, /pin_authoritative_npm:/);
  assert.match(action, /if:\s*inputs\.pin_authoritative_npm\s*==\s*'true'/);
});

test("AP-0117 nightly compatibility lanes pin npm only where npm 12 supports the Node line", () => {
  const workflow = readFileSync(".github/workflows/nightly-compat.yml", "utf8");
  const expectations = [
    ["22.22.2", "true"],
    ["24.15.0", "true"],
    ["25.0.0", "false"],
    ["26.0.0", "true"],
  ] as const;

  for (const [nodeVersion, pinMode] of expectations) {
    const escaped = nodeVersion.replaceAll(".", "\\.");
    const lane = new RegExp(
      `node:\\s*"${escaped}"[\\s\\S]{0,140}pin_authoritative_npm:\\s*"${pinMode}"`
    );
    assert.match(workflow, lane, `Node ${nodeVersion} must set pin_authoritative_npm=${pinMode}`);
  }
});

test("AP-0117 default/recommended active pins no longer contain 24.14.1", () => {
  const files = [
    ".nvmrc",
    ".github/workflows/ci.yml",
    ".github/workflows/quality.yml",
    ".github/workflows/api-route-typecheck.yml",
    ".github/workflows/dast-smoke.yml",
    ".github/workflows/build.yml",
    ".github/workflows/nightly-compat.yml",
    "scripts/check/check-toolchain-contract.mjs",
    "docs/architecture/TOOLCHAIN_CONTRACT.md",
    "bin/nodeRuntimeSupport.mjs",
    "src/shared/utils/nodeRuntimeSupport.ts",
  ];

  for (const file of files) {
    assert.equal(
      readFileSync(file, "utf8").includes("24.14.1"),
      false,
      `${file} retains the incompatible active/default pin`
    );
  }
});
