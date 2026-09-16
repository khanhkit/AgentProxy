import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateToolchainContract } from "../../../scripts/check/check-toolchain-contract.mjs";

function fixture(overrides: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "toolchain-contract-"));
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  mkdirSync(join(root, ".github", "actions", "npm-ci-retry"), { recursive: true });
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ packageManager: "npm@12.0.2" }),
    "package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
    ".nvmrc": "24.14.1\n",
    "Dockerfile": "FROM node:26.0.0-trixie-slim AS base\nRUN npm install -g npm@12.0.2\n",
    ".github/actions/npm-ci-retry/action.yml": "- name: Pin authoritative npm\n  run: npm install -g npm@12.0.2\n",
    ".github/workflows/ci.yml": 'env:\n  CI_NODE_VERSION: "24.14.1"\n',
    ".github/workflows/quality.yml": 'env:\n  CI_NODE_VERSION: "24.14.1"\n',
    ".github/workflows/nightly-compat.yml": 'matrix:\n  node: ["22.22.2", "24.14.1", "25.0.0", "26.0.0"]\n',
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

test("toolchain contract rejects package-manager and pin drift", () => {
  const root = fixture({
    "package.json": JSON.stringify({ packageManager: "pnpm@10.0.0" }),
    ".nvmrc": "24\n",
    "Dockerfile": "FROM node:26-trixie-slim AS base\nRUN npm install -g npm@latest\n",
  });
  const errors = validateToolchainContract(root).join("\n");
  assert.match(errors, /packageManager/);
  assert.match(errors, /\.nvmrc/);
  assert.match(errors, /Dockerfile.*Node/);
  assert.match(errors, /Dockerfile.*npm/);
});

test("toolchain contract rejects a missing supported-major compatibility matrix", () => {
  const root = fixture({
    ".github/workflows/nightly-compat.yml": 'matrix:\n  node: ["24.14.1", "26.0.0"]\n',
  });
  const errors = validateToolchainContract(root).join("\n");
  assert.match(errors, /22\.22\.2/);
  assert.match(errors, /25\.0\.0/);
});
