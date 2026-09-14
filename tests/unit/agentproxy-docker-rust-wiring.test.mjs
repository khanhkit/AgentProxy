import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
  const runnerBase = dockerfile.match(/AS runner-base[\s\S]*?(?=\n# ── Runner Web|$)/)?.[0] ?? "";
  assert.doesNotMatch(
    runnerBase,
    /addgroup[^\n]*node|adduser[^\n]*node/,
    "Chainguard Node already provides the node user/group; recreating it breaks both platform builds"
  );
  assert.match(runnerBase, /COPY --from=runner-debian-base --chown=node:node \/app \/app/);
  assert.match(runnerBase, /USER node/);

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

test("Docker manifest platform verification accepts pretty OCI index JSON", (t) => {
  const workflow = fs.readFileSync(".github/workflows/docker-publish.yml", "utf8");
  const step = workflow.match(
    /- name: Verify manifest platforms\n\s+shell: bash\n\s+run: \|\n((?: {10}.*(?:\n|$))+)/
  );
  assert.ok(step, "Verify manifest platforms shell step must exist");
  const script = step[1].replace(/^ {10}/gm, "");

  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), "agentproxy-fake-docker-"));
  t.after(() => fs.rmSync(fakeBin, { recursive: true, force: true }));
  const fakeDocker = path.join(fakeBin, "docker");
  fs.writeFileSync(
    fakeDocker,
    `#!/usr/bin/env bash
cat <<'JSON'
{
  "schemaVersion": 2,
  "manifests": [
    {"platform": {"architecture": "amd64", "os": "linux"}},
    {"platform": {"architecture": "arm64", "os": "linux"}}
  ]
}
JSON
`
  );
  fs.chmodSync(fakeDocker, 0o755);

  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      IMAGE_NAME: "ghcr.io/example/agentproxy",
      VERSION: "0.1.0",
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    },
  });

  assert.equal(
    result.status,
    0,
    `pretty OCI index with linux/amd64 + linux/arm64 must pass; stderr=${result.stderr}`
  );
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
