// AgentProxy container publication contract.
// The inherited AgentProxy :next/release-branch channel was intentionally removed
// when AgentProxy narrowed production to release + explicit main dispatch.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  assert.doesNotMatch(WORKFLOW, /diegosouzapw\/agentproxy/i);
  assert.doesNotMatch(WORKFLOW, /docker\.io\/.*agentproxy/i);
});

test("both native Linux architectures are built and exactly two digests are required", () => {
  assert.match(WORKFLOW, /platform: linux\/amd64[\s\S]*?runner: ubuntu-24\.04/);
  assert.match(WORKFLOW, /platform: linux\/arm64[\s\S]*?runner: ubuntu-24\.04-arm/);
  assert.match(WORKFLOW, /if \[ "\$\{#digest_files\[@\]\}" -ne 2 \]/);
});

test("every platform image is runtime-smoked before publication", () => {
  assert.match(WORKFLOW, /name: Smoke platform image/);
  assert.match(
    WORKFLOW,
    /docker exec agentproxy-smoke test -x \/app\/rust\/target\/release\/agentproxy-gateway/
  );
  assert.match(WORKFLOW, /127\.0\.0\.1:20128\/readyz/);
  assert.match(WORKFLOW, /127\.0\.0\.1:20129\/healthz/);
});

test("platform images retain blocking HIGH and CRITICAL vulnerability scanning", () => {
  const gate = WORKFLOW.match(
    /- name: Scan platform image for vulnerabilities[\s\S]*?severity: CRITICAL,HIGH/
  );
  assert.ok(gate, "blocking Trivy gate must remain present");
  assert.match(gate[0], /exit-code: "1"/);
  assert.match(gate[0], /ignore-unfixed: false/);
});

test("Trivy exceptions are explicit, reviewable, and time-bounded", () => {
  const ignorePath = path.join(ROOT, ".trivyignore.yaml");
  assert.equal(
    existsSync(ignorePath),
    true,
    "release scan exceptions must live in .trivyignore.yaml"
  );
  assert.match(WORKFLOW, /trivyignores:\s*\.trivyignore\.yaml/);

  const ignore = readFileSync(ignorePath, "utf8");
  const expected = [
    "CVE-2025-69720",
    "CVE-2026-16742",
    "CVE-2026-54369",
    "CVE-2026-76642",
    "CVE-2026-78408",
    "CVE-2026-78409",
    "CVE-2026-78410",
    "CVE-2026-9538",
  ];
  for (const cve of expected) {
    assert.match(ignore, new RegExp(`- id: ${cve}\\n(?:[\\s\\S]*?\\n)?\\s+expired_at: 2026-10-15`));
  }
  assert.equal((ignore.match(/- id: CVE-/g) ?? []).length, expected.length);
  assert.match(ignore, /statement:/);
});

test("published manifest carries supply-chain evidence and is keyless-signed", () => {
  assert.match(WORKFLOW, /provenance: mode=max/);
  assert.match(WORKFLOW, /sbom: true/);
  assert.match(WORKFLOW, /cosign sign --yes "\$\{IMAGE_NAME\}@\$\{DIGEST\}"/);
  assert.match(WORKFLOW, /cosign verify "\$\{IMAGE_NAME\}@\$\{DIGEST\}"/);
});
