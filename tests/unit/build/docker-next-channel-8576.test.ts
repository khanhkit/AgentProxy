// AgentProxy container publication contract.
// The inherited OmniRoute :next/release-branch channel was intentionally removed
// when AgentProxy narrowed production to release + explicit main dispatch.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");
const WORKFLOW = readFileSync(path.join(ROOT, ".github/workflows/docker-publish.yml"), "utf8");

test("container publication is release-driven with explicit manual dispatch only", () => {
  assert.match(WORKFLOW, /\n  release:\n\s+types: \[released\]/);
  assert.match(WORKFLOW, /\n  workflow_dispatch:\n/);
  assert.doesNotMatch(WORKFLOW, /\n  push:\n/);
  assert.match(WORKFLOW, /Manual container publication is only allowed from main/);
  assert.match(WORKFLOW, /REF_NAME.*github\.ref/);
});

test("AgentProxy publishes only the GHCR AgentProxy image", () => {
  assert.match(WORKFLOW, /IMAGE_NAME: ghcr\.io\/\$\{\{ github\.repository_owner \}\}\/agentproxy/);
  assert.doesNotMatch(WORKFLOW, /diegosouzapw\/omniroute/i);
  assert.doesNotMatch(WORKFLOW, /docker\.io\/.*omniroute/i);
});

test("both native Linux architectures are built and exactly two digests are required", () => {
  assert.match(WORKFLOW, /platform: linux\/amd64[\s\S]*?runner: ubuntu-24\.04/);
  assert.match(WORKFLOW, /platform: linux\/arm64[\s\S]*?runner: ubuntu-24\.04-arm/);
  assert.match(WORKFLOW, /if \[ "\$\{#digest_files\[@\]\}" -ne 2 \]/);
});

test("every platform image is runtime-smoked before publication", () => {
  assert.match(WORKFLOW, /name: Smoke platform image/);
  assert.match(WORKFLOW, /docker exec agentproxy-smoke test -x \/app\/rust\/target\/release\/agentproxy-gateway/);
  assert.match(WORKFLOW, /127\.0\.0\.1:20128\/readyz/);
  assert.match(WORKFLOW, /127\.0\.0\.1:20129\/healthz/);
});

test("platform images retain blocking HIGH and CRITICAL vulnerability scanning", () => {
  const gate = WORKFLOW.match(/- name: Scan platform image for vulnerabilities[\s\S]*?severity: CRITICAL,HIGH/);
  assert.ok(gate, "blocking Trivy gate must remain present");
  assert.match(gate[0], /exit-code: "1"/);
  assert.match(gate[0], /ignore-unfixed: false/);
});

test("published manifest carries supply-chain evidence and is keyless-signed", () => {
  assert.match(WORKFLOW, /provenance: mode=max/);
  assert.match(WORKFLOW, /sbom: true/);
  assert.match(WORKFLOW, /cosign sign --yes "\$\{IMAGE_NAME\}@\$\{DIGEST\}"/);
  assert.match(WORKFLOW, /cosign verify "\$\{IMAGE_NAME\}@\$\{DIGEST\}"/);
});
