#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const TOOLCHAIN = Object.freeze({
  packageManager: "npm@12.0.2",
  npmVersion: "12.0.2",
  defaultNode: "24.14.1",
  dockerNode: "26.0.0-trixie-slim",
  compatibilityNodes: Object.freeze(["22.22.2", "24.14.1", "25.0.0", "26.0.0"]),
});

function read(root, file, errors) {
  try { return fs.readFileSync(path.join(root, file), "utf8"); }
  catch { errors.push(`${file} is required by the toolchain contract`); return ""; }
}

export function validateToolchainContract(root = process.cwd()) {
  const errors = [];
  const packageText = read(root, "package.json", errors);
  const lockText = read(root, "package-lock.json", errors);
  const nvmrc = read(root, ".nvmrc", errors).trim();
  const dockerfile = read(root, "Dockerfile", errors);
  const npmAction = read(root, ".github/actions/npm-ci-retry/action.yml", errors);
  const ci = read(root, ".github/workflows/ci.yml", errors);
  const quality = read(root, ".github/workflows/quality.yml", errors);
  const compat = read(root, ".github/workflows/nightly-compat.yml", errors);

  let pkg = {};
  let lock = {};
  try { pkg = JSON.parse(packageText); } catch { errors.push("package.json must be valid JSON"); }
  try { lock = JSON.parse(lockText); } catch { errors.push("package-lock.json must be valid JSON"); }

  if (pkg.packageManager !== TOOLCHAIN.packageManager) {
    errors.push(`packageManager must be ${TOOLCHAIN.packageManager}`);
  }
  if (lock.lockfileVersion !== 3) errors.push("package-lock.json lockfileVersion must be 3");
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) {
    errors.push("pnpm-lock.yaml is not allowed while npm/package-lock.json is authoritative");
  }
  if (nvmrc !== TOOLCHAIN.defaultNode) errors.push(`.nvmrc must pin ${TOOLCHAIN.defaultNode}`);
  if (!dockerfile.includes(`FROM node:${TOOLCHAIN.dockerNode} AS base`)) {
    errors.push(`Dockerfile Node base must pin node:${TOOLCHAIN.dockerNode}`);
  }
  if (!dockerfile.includes(`npm install -g npm@${TOOLCHAIN.npmVersion}`) || /npm\s+install\s+-g\s+npm@latest(?:[;\s]|$)/m.test(dockerfile)) {
    errors.push(`Dockerfile npm must pin npm@${TOOLCHAIN.npmVersion}`);
  }
  if (!npmAction.includes(`npm install -g npm@${TOOLCHAIN.npmVersion}`)) {
    errors.push(`npm-ci-retry action must pin npm@${TOOLCHAIN.npmVersion}`);
  }
  for (const [name, text] of [["ci.yml", ci], ["quality.yml", quality]]) {
    if (!text.includes(`CI_NODE_VERSION: "${TOOLCHAIN.defaultNode}"`)) {
      errors.push(`${name} CI_NODE_VERSION must pin ${TOOLCHAIN.defaultNode}`);
    }
  }
  for (const version of TOOLCHAIN.compatibilityNodes) {
    if (!compat.includes(`"${version}"`)) errors.push(`nightly compatibility matrix must include ${version}`);
  }
  return errors;
}

function main() {
  const errors = validateToolchainContract();
  if (errors.length) {
    console.error("[toolchain-contract] FAIL");
    for (const error of errors) console.error(` - ${error}`);
    process.exit(1);
  }
  console.log(`[toolchain-contract] OK — ${TOOLCHAIN.packageManager}, Node ${TOOLCHAIN.defaultNode} default, compatibility ${TOOLCHAIN.compatibilityNodes.join(", ")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
