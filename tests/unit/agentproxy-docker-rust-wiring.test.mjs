import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dockerfile = fs.readFileSync("Dockerfile", "utf8");
const assemble = fs.readFileSync("scripts/build/assembleStandalone.mjs", "utf8");
const standalone = fs.readFileSync("scripts/dev/run-standalone.mjs", "utf8");

test("Docker image ships and enables the AgentProxy Rust gateway", () => {
  assert.match(dockerfile, /FROM rust:[^\n]+ AS rust-builder/);
  assert.match(dockerfile, /cargo build .*--release -p agentproxy-gateway/);
  assert.match(
    dockerfile,
    /COPY --from=rust-builder \/tmp\/agentproxy-gateway \.\/rust\/target\/release\/agentproxy-gateway/
  );
  assert.match(dockerfile, /ENV AGENTPROXY_RUST_CORE=1/);
  assert.match(
    dockerfile,
    /ENV AGENTPROXY_RUST_CORE_HOST=0\.0\.0\.0/,
    "Docker must bind the Rust API gateway to the container interface so published port 20128 is reachable"
  );
});

test("production runner uses a pinned zero-HIGH glibc runtime without weakening Trivy", () => {
  assert.match(
    dockerfile,
    /FROM cgr\.dev\/chainguard\/node@sha256:37ea42c0860729767b090a7c700c836eac660eb4bcfee3b5fe63eb85acd63df4 AS runner-base/,
    "runner-base must use the verified multi-arch Chainguard Node digest"
  );
  assert.match(dockerfile, /apk add --no-cache[^\n]*libsecret/);
  assert.match(dockerfile, /adduser[^\n]*-u 1000[^\n]*node/);

  const workflow = fs.readFileSync(".github/workflows/docker-publish.yml", "utf8");
  assert.match(workflow, /ignore-unfixed:\s*false/);
});

test("standalone bundle ships and launches the Rust supervisor", () => {
  assert.match(assemble, /rust-core-supervisor\.mjs/);
  assert.match(standalone, /from "\.\/rust-core-supervisor\.mjs"/);
  assert.match(standalone, /startRustCore\(/);
  assert.match(standalone, /stopRustCore\(/);
});

test("Docker publish workflow is AgentProxy GHCR-only and multi-arch", () => {
  const workflow = fs.readFileSync(".github/workflows/docker-publish.yml", "utf8");
  assert.match(workflow, /ghcr\.io\/\$\{\{ github\.repository_owner \}\}\/agentproxy/i);
  assert.doesNotMatch(workflow, /diegosouzapw\/omniroute/i);
  assert.doesNotMatch(workflow, /DOCKERHUB_(USERNAME|TOKEN)/);
  assert.doesNotMatch(workflow, /docker\.io/i);
  assert.match(workflow, /linux\/amd64/);
  assert.match(workflow, /linux\/arm64/);
  assert.match(workflow, /OMNIROUTE_BUILD_MEMORY_MB=7168/);
  assert.match(workflow, /OMNIROUTE_USE_TURBOPACK=0/);
});

test("Docker publish workflow enforces supply-chain gates before promotion", () => {
  const workflow = fs.readFileSync(".github/workflows/docker-publish.yml", "utf8");
  assert.match(workflow, /provenance:\s*mode=max/);
  assert.match(workflow, /sbom:\s*true/);
  assert.match(workflow, /aquasecurity\/trivy-action@[0-9a-f]{40}/);
  assert.match(workflow, /severity:\s*["']?CRITICAL,HIGH["']?/);
  assert.match(workflow, /exit-code:\s*["']?1["']?/);
  assert.match(workflow, /sigstore\/cosign-installer@[0-9a-f]{40}/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /cosign sign --yes/);
  assert.match(workflow, /cosign verify/);
});
