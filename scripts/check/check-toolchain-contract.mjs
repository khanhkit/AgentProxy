#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const TOOLCHAIN = Object.freeze({
  packageManager: "npm@12.0.2",
  npmVersion: "12.0.2",
  npmNodeEngine: "^22.22.2 || ^24.15.0 || >=26.0.0",
  defaultNode: "24.15.0",
  dockerNode: "26.0.0-trixie-slim",
  compatibilityNodes: Object.freeze(["22.22.2", "24.15.0", "25.0.0", "26.0.0"]),
  bundledNpmCompatibilityNodes: Object.freeze(["25.0.0"]),
});

function read(root, file, errors) {
  try {
    return fs.readFileSync(path.join(root, file), "utf8");
  } catch {
    errors.push(`${file} is required by the toolchain contract`);
    return "";
  }
}

function parseExactVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || ""));
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function atLeast(version, floor) {
  const parsed = parseExactVersion(version);
  const minimum = parseExactVersion(floor);
  if (!parsed || !minimum || parsed.major !== minimum.major) return false;
  if (parsed.minor !== minimum.minor) return parsed.minor > minimum.minor;
  return parsed.patch >= minimum.patch;
}

export function authoritativeNpmSupportsNode(version) {
  const parsed = parseExactVersion(version);
  if (!parsed) return false;
  if (parsed.major === 22) return atLeast(version, "22.22.2");
  if (parsed.major === 24) return atLeast(version, "24.15.0");
  return parsed.major >= 26;
}

function includesExactNodePin(text, version) {
  return text.includes(`node-version: "${version}"`);
}

function includesRecommendedNode(text, version) {
  return text.includes(`RECOMMENDED_NODE_VERSION = "${version}"`);
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
  const apiRouteTypecheck = read(root, ".github/workflows/api-route-typecheck.yml", errors);
  const dastSmoke = read(root, ".github/workflows/dast-smoke.yml", errors);
  const build = read(root, ".github/workflows/build.yml", errors);
  const runtimeSupport = read(root, "src/shared/utils/nodeRuntimeSupport.ts", errors);
  const cliRuntimeSupport = read(root, "bin/nodeRuntimeSupport.mjs", errors);

  let pkg = {};
  let lock = {};
  try {
    pkg = JSON.parse(packageText);
  } catch {
    errors.push("package.json must be valid JSON");
  }
  try {
    lock = JSON.parse(lockText);
  } catch {
    errors.push("package-lock.json must be valid JSON");
  }

  if (pkg.packageManager !== TOOLCHAIN.packageManager) {
    errors.push(`packageManager must be ${TOOLCHAIN.packageManager}`);
  }
  if (lock.lockfileVersion !== 3) errors.push("package-lock.json lockfileVersion must be 3");
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) {
    errors.push("pnpm-lock.yaml is not allowed while npm/package-lock.json is authoritative");
  }

  if (!authoritativeNpmSupportsNode(TOOLCHAIN.defaultNode)) {
    errors.push(
      `default Node ${TOOLCHAIN.defaultNode} must satisfy npm ${TOOLCHAIN.npmVersion} engines ${TOOLCHAIN.npmNodeEngine}`
    );
  }

  for (const version of TOOLCHAIN.compatibilityNodes) {
    const usesBundledNpm = TOOLCHAIN.bundledNpmCompatibilityNodes.includes(version);
    if (!authoritativeNpmSupportsNode(version) && !usesBundledNpm) {
      errors.push(
        `compatibility Node ${version} is rejected by npm ${TOOLCHAIN.npmVersion}; declare an explicit bundled-npm compatibility exception or choose a supported Node`
      );
    }
  }
  for (const version of TOOLCHAIN.bundledNpmCompatibilityNodes) {
    if (!TOOLCHAIN.compatibilityNodes.includes(version)) {
      errors.push(`bundled-npm exception ${version} must also be a compatibility Node`);
    }
    if (authoritativeNpmSupportsNode(version)) {
      errors.push(
        `bundled-npm exception ${version} is stale because authoritative npm now supports it`
      );
    }
  }

  if (nvmrc !== TOOLCHAIN.defaultNode) {
    errors.push(`.nvmrc must pin ${TOOLCHAIN.defaultNode}`);
  }
  if (!dockerfile.includes(`FROM node:${TOOLCHAIN.dockerNode} AS base`)) {
    errors.push(`Dockerfile Node base must pin node:${TOOLCHAIN.dockerNode}`);
  }
  if (
    !dockerfile.includes(`npm install -g npm@${TOOLCHAIN.npmVersion}`) ||
    /npm\s+install\s+-g\s+npm@latest(?:[;\s]|$)/m.test(dockerfile)
  ) {
    errors.push(`Dockerfile npm must pin npm@${TOOLCHAIN.npmVersion}`);
  }

  if (!npmAction.includes(`npm install -g npm@${TOOLCHAIN.npmVersion}`)) {
    errors.push(`npm-ci-retry action must pin npm@${TOOLCHAIN.npmVersion}`);
  }
  if (!npmAction.includes("pin_authoritative_npm:")) {
    errors.push(
      "npm-ci-retry action must expose the explicit pin_authoritative_npm compatibility switch"
    );
  }
  if (!npmAction.includes("if: inputs.pin_authoritative_npm == 'true'")) {
    errors.push("npm-ci-retry authoritative npm pin must be conditional on pin_authoritative_npm");
  }

  for (const [name, text] of [
    ["ci.yml", ci],
    ["quality.yml", quality],
  ]) {
    if (!text.includes(`CI_NODE_VERSION: "${TOOLCHAIN.defaultNode}"`)) {
      errors.push(`${name} CI_NODE_VERSION must pin ${TOOLCHAIN.defaultNode}`);
    }
  }
  if (!ci.includes(`CI_NODE_24_VERSION: "${TOOLCHAIN.defaultNode}"`)) {
    errors.push(`ci.yml CI_NODE_24_VERSION must pin ${TOOLCHAIN.defaultNode}`);
  }

  for (const [name, text] of [
    ["api-route-typecheck.yml", apiRouteTypecheck],
    ["dast-smoke.yml", dastSmoke],
    ["build.yml", build],
  ]) {
    if (!includesExactNodePin(text, TOOLCHAIN.defaultNode)) {
      errors.push(`${name} default node-version must pin ${TOOLCHAIN.defaultNode}`);
    }
  }

  for (const version of TOOLCHAIN.compatibilityNodes) {
    if (!compat.includes(`node: "${version}"`)) {
      errors.push(`nightly compatibility matrix must include ${version}`);
    }
    const expectedPin = TOOLCHAIN.bundledNpmCompatibilityNodes.includes(version) ? "false" : "true";
    const lanePattern = new RegExp(
      `node:\\s*"${version.replaceAll(".", "\\.")}"[\\s\\S]{0,120}pin_authoritative_npm:\\s*"${expectedPin}"`
    );
    if (!lanePattern.test(compat)) {
      errors.push(
        `nightly compatibility Node ${version} must set pin_authoritative_npm="${expectedPin}"`
      );
    }
  }
  if (!compat.includes("pin_authoritative_npm: ${{ matrix.pin_authoritative_npm }}")) {
    errors.push("nightly compatibility workflow must pass its npm-pin mode to npm-ci-retry");
  }

  for (const [name, text] of [
    ["src/shared/utils/nodeRuntimeSupport.ts", runtimeSupport],
    ["bin/nodeRuntimeSupport.mjs", cliRuntimeSupport],
  ]) {
    if (!includesRecommendedNode(text, TOOLCHAIN.defaultNode)) {
      errors.push(`${name} recommended Node must be ${TOOLCHAIN.defaultNode}`);
    }
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
  console.log(
    `[toolchain-contract] OK — ${TOOLCHAIN.packageManager}, Node ${TOOLCHAIN.defaultNode} default, compatibility ${TOOLCHAIN.compatibilityNodes.join(", ")}`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
