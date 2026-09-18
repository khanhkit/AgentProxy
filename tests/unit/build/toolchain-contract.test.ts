import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  TOOLCHAIN,
  authoritativeNpmSupportsNode,
  validateToolchainContract,
} from "../../../scripts/check/check-toolchain-contract.mjs";

function validNightlyCompat(): string {
  return [
    "matrix:",
    "  include:",
    '    - node: "22.22.2"',
    '      pin_authoritative_npm: "true"',
    '    - node: "24.15.0"',
    '      pin_authoritative_npm: "true"',
    '    - node: "25.0.0"',
    '      pin_authoritative_npm: "false"',
    '    - node: "26.0.0"',
    '      pin_authoritative_npm: "true"',
    "steps:",
    "  - uses: ./.github/actions/npm-ci-retry",
    "    with:",
    "      pin_authoritative_npm: ${{ matrix.pin_authoritative_npm }}",
    "",
  ].join("\n");
}

function fixture(overrides: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "toolchain-contract-"));
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  mkdirSync(join(root, ".github", "actions", "npm-ci-retry"), { recursive: true });
  mkdirSync(join(root, "src", "shared", "utils"), { recursive: true });
  mkdirSync(join(root, "bin"), { recursive: true });

  const files: Record<string, string> = {
    "package.json": JSON.stringify({ packageManager: "npm@12.0.2" }),
    "package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
    ".nvmrc": "24.15.0\n",
    Dockerfile: "FROM node:26.0.0-trixie-slim AS base\nRUN npm install -g npm@12.0.2\n",
    ".github/actions/npm-ci-retry/action.yml": [
      "inputs:",
      "  pin_authoritative_npm:",
      '    default: "true"',
      "runs:",
      "  using: composite",
      "  steps:",
      "    - name: Pin authoritative npm",
      "      if: inputs.pin_authoritative_npm == 'true'",
      "      run: npm install -g npm@12.0.2",
      "",
    ].join("\n"),
    ".github/workflows/ci.yml":
      'env:\n  CI_NODE_VERSION: "24.15.0"\n  CI_NODE_24_VERSION: "24.15.0"\n',
    ".github/workflows/quality.yml": 'env:\n  CI_NODE_VERSION: "24.15.0"\n',
    ".github/workflows/api-route-typecheck.yml": 'node-version: "24.15.0"\n',
    ".github/workflows/dast-smoke.yml": 'node-version: "24.15.0"\n',
    ".github/workflows/build.yml": 'node-version: "24.15.0"\n',
    ".github/workflows/nightly-compat.yml": validNightlyCompat(),
    "src/shared/utils/nodeRuntimeSupport.ts":
      'export const RECOMMENDED_NODE_VERSION = "24.15.0";\n',
    "bin/nodeRuntimeSupport.mjs": 'export const RECOMMENDED_NODE_VERSION = "24.15.0";\n',
    ...overrides,
  };

  for (const [path, value] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, value);
  }
  return root;
}

test("repository toolchain contract is internally reproducible", () => {
  assert.deepEqual(validateToolchainContract(process.cwd()), []);
});

test("a complete synthetic toolchain contract is accepted", () => {
  assert.deepEqual(validateToolchainContract(fixture()), []);
});

test("toolchain contract rejects package-manager and pin drift", () => {
  const root = fixture({
    "package.json": JSON.stringify({ packageManager: "pnpm@10.0.0" }),
    ".nvmrc": "24\n",
    Dockerfile: "FROM node:26-trixie-slim AS base\nRUN npm install -g npm@latest\n",
  });
  const errors = validateToolchainContract(root).join("\n");
  assert.match(errors, /packageManager/);
  assert.match(errors, /\.nvmrc/);
  assert.match(errors, /Dockerfile.*Node/);
  assert.match(errors, /Dockerfile.*npm/);
});

test("toolchain contract rejects a missing supported-major compatibility lane", () => {
  const root = fixture({
    ".github/workflows/nightly-compat.yml": [
      "matrix:",
      "  include:",
      '    - node: "24.15.0"',
      '      pin_authoritative_npm: "true"',
      '    - node: "26.0.0"',
      '      pin_authoritative_npm: "true"',
      "steps:",
      "  - uses: ./.github/actions/npm-ci-retry",
      "    with:",
      "      pin_authoritative_npm: ${{ matrix.pin_authoritative_npm }}",
      "",
    ].join("\n"),
  });
  const errors = validateToolchainContract(root).join("\n");
  assert.match(errors, /22\.22\.2/);
  assert.match(errors, /25\.0\.0/);
});

test("Node 25 remains supported only through the explicit bundled-npm exception", () => {
  assert.equal(authoritativeNpmSupportsNode("25.0.0"), false);
  assert.ok(TOOLCHAIN.bundledNpmCompatibilityNodes.includes("25.0.0"));

  const root = fixture({
    ".github/workflows/nightly-compat.yml": validNightlyCompat().replace(
      'node: "25.0.0"\n      pin_authoritative_npm: "false"',
      'node: "25.0.0"\n      pin_authoritative_npm: "true"'
    ),
  });
  const errors = validateToolchainContract(root).join("\n");
  assert.match(errors, /25\.0\.0.*pin_authoritative_npm="false"/);
});

test("npm 12.0.2 engine boundary rejects 24.14/25 and accepts repaired lanes", () => {
  assert.equal(authoritativeNpmSupportsNode("22.22.2"), true);
  assert.equal(authoritativeNpmSupportsNode("24.14.1"), false);
  assert.equal(authoritativeNpmSupportsNode("24.15.0"), true);
  assert.equal(authoritativeNpmSupportsNode("25.0.0"), false);
  assert.equal(authoritativeNpmSupportsNode("26.0.0"), true);
});
