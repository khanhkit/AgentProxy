import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load as loadYaml } from "js-yaml";

import {
  evaluateMainOnlyBranches,
  evaluateProvenanceManifest,
  parseGhBranchNames,
  parseGitRemoteHeads,
} from "../../scripts/check/check-release-branch-hygiene.mjs";

function extractWorkflowJob(yaml, jobName) {
  const normalized = yaml.replace(/\r\n/gu, "\n");
  const escapedJobName = jobName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const header = new RegExp(`^  ${escapedJobName}:\\s*(?:#.*)?$`, "mu").exec(normalized);
  assert.notStrictEqual(header, null, `workflow job not found: ${jobName}`);
  const start = header.index;
  const tail = normalized.slice(start + header[0].length);
  const nextJob = /\n  [A-Za-z0-9_-]+:\s*(?:#.*)?(?:\n|$)/u.exec(tail);
  const end = nextJob ? start + header[0].length + nextJob.index : normalized.length;
  return normalized.slice(start, end);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseWorkflowJob(jobText) {
  const parsed = loadYaml(`jobs:\n${jobText}`);
  assert.ok(isRecord(parsed), "workflow YAML must parse to a mapping");
  assert.ok(isRecord(parsed.jobs), "workflow YAML must contain jobs");
  const jobs = Object.values(parsed.jobs);
  assert.equal(jobs.length, 1, "extracted workflow fragment must contain exactly one job");
  const job = jobs[0];
  assert.ok(isRecord(job), "workflow job must be a mapping");
  assert.ok(Array.isArray(job.steps), "workflow job must contain a steps array");
  return { ...job, steps: job.steps };
}

function assertTrustedCheckoutBeforeGuard(jobText, expectedCondition = null) {
  const { steps } = parseWorkflowJob(jobText);
  const guardIndexes = steps.flatMap((step, index) =>
    isRecord(step) && step.name === "Enforce main-only release branch invariant" ? [index] : []
  );
  assert.equal(
    guardIndexes.length,
    1,
    "release prepare job must contain exactly one branch-hygiene guard"
  );
  const guardIndex = guardIndexes[0];
  const guardStep = steps[guardIndex];
  assert.ok(isRecord(guardStep), "release branch-hygiene guard must be a step mapping");
  assert.equal(
    guardStep.run,
    "node scripts/check/check-release-branch-hygiene.mjs",
    "release branch-hygiene guard must run the expected checker"
  );

  const checkoutSteps = steps.slice(0, guardIndex).filter((step) => {
    if (!isRecord(step) || typeof step.uses !== "string") return false;
    return step.uses.startsWith("actions/checkout@");
  });
  assert.equal(
    checkoutSteps.length,
    1,
    "release prepare job must contain exactly one actions/checkout before the guard"
  );
  const checkoutStep = checkoutSteps[0];
  assert.ok(isRecord(checkoutStep), "release checkout must be a step mapping");
  assert.match(
    String(checkoutStep.uses),
    /^actions\/checkout@[0-9a-f]{40}$/u,
    "release prepare job must use a SHA-pinned actions/checkout"
  );

  const checkoutWith = isRecord(checkoutStep.with) ? checkoutStep.with : {};
  assert.equal(
    Object.hasOwn(checkoutWith, "repository"),
    false,
    "release control-plane checkout must use the current trusted repository/ref"
  );
  assert.equal(checkoutWith.ref, "main", "release control-plane checkout must pin ref: main");
  assert.equal(
    checkoutWith["persist-credentials"],
    false,
    "release control-plane checkout must not persist credentials"
  );

  const checkoutCondition = checkoutStep.if ?? null;
  const guardCondition = guardStep.if ?? null;
  assert.equal(
    checkoutCondition,
    expectedCondition,
    expectedCondition === null
      ? "release checkout must not be conditional"
      : "release checkout must use the intended release condition"
  );
  assert.equal(
    guardCondition,
    expectedCondition,
    expectedCondition === null
      ? "release branch-hygiene guard must not be conditional"
      : "release checkout and branch-hygiene guard must use the same intended condition"
  );
}

test("release branch hygiene accepts exactly main", () => {
  assert.deepEqual(evaluateMainOnlyBranches(["main"]), {
    ok: true,
    branches: ["main"],
    hasMain: true,
    unexpected: [],
  });
});

test("release branch hygiene rejects extra feature branches", () => {
  const result = evaluateMainOnlyBranches(["kitdev1/omniroute-product-runtime-0124", "main"]);
  assert.equal(result.ok, false);
  assert.equal(result.hasMain, true);
  assert.deepEqual(result.unexpected, ["kitdev1/omniroute-product-runtime-0124"]);
});

test("release branch hygiene fails closed when main is absent", () => {
  const result = evaluateMainOnlyBranches([]);
  assert.equal(result.ok, false);
  assert.equal(result.hasMain, false);
});

test("release provenance requires immutable source-to-main mapping", () => {
  assert.deepEqual(
    evaluateProvenanceManifest({
      entries: [
        {
          sourceBranch: "kit/worker/task",
          sourceHeadSha: "1".repeat(40),
          disposition: "integrated",
          pullRequest: 123,
          acceptedMainSha: "2".repeat(40),
        },
      ],
    }),
    { ok: true, failures: [] }
  );

  const missing = evaluateProvenanceManifest({
    entries: [
      {
        sourceBranch: "kit/worker/task",
        sourceHeadSha: "1".repeat(40),
        disposition: "integrated",
      },
    ],
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.failures, ["entries[0].pullRequest", "entries[0].acceptedMainSha"]);
});

test("git remote parser handles slash branch names and deduplicates", () => {
  const output = [
    "1111111111111111111111111111111111111111\trefs/heads/main",
    "2222222222222222222222222222222222222222\trefs/heads/kitdev3/release-main-only",
    "2222222222222222222222222222222222222222\trefs/heads/kitdev3/release-main-only",
    "",
  ].join("\n");
  assert.deepEqual(parseGitRemoteHeads(output), ["kitdev3/release-main-only", "main"]);
});

test("git remote parser rejects malformed authority output", () => {
  assert.throws(() => parseGitRemoteHeads("not-a-head"), /unexpected git ls-remote output/u);
});

test("GitHub API branch parser normalizes newline output", () => {
  assert.deepEqual(parseGhBranchNames("main\nfeature/x\nmain\n"), ["feature/x", "main"]);
});

test("all release entrypoints enforce the main-only branch invariant", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8")
  );
  assert.equal(
    packageJson.scripts["check:release-branch-hygiene"],
    "node scripts/check/check-release-branch-hygiene.mjs"
  );
  assert.match(packageJson.scripts.prepublishOnly, /^npm run check:release-branch-hygiene &&/u);

  const validator = readFileSync(
    new URL("../../scripts/quality/validate-release-green.mjs", import.meta.url),
    "utf8"
  );
  assert.match(
    validator,
    /hardCmd\([\s\S]*?"release-branch-hygiene"[\s\S]*?check:release-branch-hygiene/u
  );

  const dockerPublish = readFileSync(
    new URL("../../.github/workflows/docker-publish.yml", import.meta.url),
    "utf8"
  );
  assert.match(dockerPublish, /Enforce main-only release branch invariant/u);
  assert.match(dockerPublish, /check-release-branch-hygiene\.mjs/u);
  const dockerPrepareJob = extractWorkflowJob(dockerPublish, "prepare");
  assertTrustedCheckoutBeforeGuard(dockerPrepareJob);

  const nativeRelease = readFileSync(
    new URL("../../.github/workflows/release-platforms.yml", import.meta.url),
    "utf8"
  );
  assert.match(nativeRelease, /Enforce main-only release branch invariant/u);
  assert.match(nativeRelease, /check-release-branch-hygiene\.mjs/u);
  assert.match(
    nativeRelease,
    /github\.event_name == 'release' \|\| inputs\.publish_assets == true/u
  );
  const nativePrepareJob = extractWorkflowJob(nativeRelease, "prepare");
  assertTrustedCheckoutBeforeGuard(
    nativePrepareJob,
    "${{ github.event_name == 'release' || inputs.publish_assets == true }}"
  );
});

test("workflow job extraction cannot borrow checkout evidence from a later job", () => {
  const synthetic = [
    "jobs:",
    "  prepare:",
    "    steps:",
    "      - name: Enforce main-only release branch invariant",
    "        run: node scripts/check/check-release-branch-hygiene.mjs",
    "  later:",
    "    steps:",
    "      - uses: actions/checkout@0123456789012345678901234567890123456789",
    "",
  ].join("\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.doesNotMatch(prepare, /actions\/checkout@/u);
});

test("workflow job extraction anchors job headers and handles CRLF boundaries", () => {
  const synthetic = [
    "jobs:",
    "  prelude:",
    "    steps:",
    "      - run: echo '  prepare:'",
    "  prepare:",
    "    steps:",
    "      - name: Enforce main-only release branch invariant",
    "        run: node scripts/check/check-release-branch-hygiene.mjs",
    "  later:",
    "    steps:",
    "      - uses: actions/checkout@0123456789012345678901234567890123456789",
    "",
  ].join("\r\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.match(prepare, /^  prepare:\r?$/mu);
  assert.doesNotMatch(prepare, /echo .*prepare:/u);
  assert.doesNotMatch(prepare, /actions\/checkout@/u);
});

test("release checkout oracle rejects conditional or untrusted checkout overrides", () => {
  const synthetic = [
    "jobs:",
    "  prepare:",
    "    steps:",
    "      - name: Checkout attacker-selected release control plane",
    "        if: ${{ github.actor == 'attacker' }}",
    "        uses: actions/checkout@0123456789012345678901234567890123456789",
    "        with:",
    "          repository: attacker/fork",
    "          ref: refs/heads/payload",
    "      - name: Enforce main-only release branch invariant",
    "        run: node scripts/check/check-release-branch-hygiene.mjs",
    "",
  ].join("\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.throws(
    () => assertTrustedCheckoutBeforeGuard(prepare),
    /must not be conditional|must use the current trusted repository\/ref/u
  );
});

test("release checkout oracle rejects a second checkout before the guard", () => {
  const synthetic = [
    "jobs:",
    "  prepare:",
    "    steps:",
    "      - name: Checkout trusted release control plane",
    "        uses: actions/checkout@0123456789012345678901234567890123456789",
    "        with:",
    "          ref: main",
    "          persist-credentials: false",
    "      - name: Replace worktree with attacker content",
    "        uses: actions/checkout@1111111111111111111111111111111111111111",
    "        with:",
    "          repository: attacker/fork",
    "          ref: refs/heads/payload",
    "      - name: Enforce main-only release branch invariant",
    "        run: node scripts/check/check-release-branch-hygiene.mjs",
    "",
  ].join("\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.throws(() => assertTrustedCheckoutBeforeGuard(prepare), /exactly one actions\/checkout/u);
});

test("release checkout oracle ignores a checkout that occurs after the guard", () => {
  const synthetic = [
    "jobs:",
    "  prepare:",
    "    steps:",
    "      - name: Checkout trusted release control plane",
    "        uses: actions/checkout@0123456789012345678901234567890123456789",
    "        with:",
    "          ref: main",
    "          persist-credentials: false",
    "      - name: Enforce main-only release branch invariant",
    "        run: node scripts/check/check-release-branch-hygiene.mjs",
    "      - name: Checkout release artifact source",
    "        uses: actions/checkout@1111111111111111111111111111111111111111",
    "        with:",
    "          ref: refs/tags/v1.2.3",
    "          persist-credentials: false",
    "",
  ].join("\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.doesNotThrow(() => assertTrustedCheckoutBeforeGuard(prepare));
});

test("release checkout oracle derives the checkout step boundary from YAML indentation", () => {
  const synthetic = [
    "jobs:",
    "  prepare:",
    "    steps:",
    "        - name: Harmless conditional step",
    "          if: ${{ always() }}",
    "          run: echo prelude",
    "        - name: Checkout trusted release control plane",
    "          uses: actions/checkout@0123456789012345678901234567890123456789",
    "          with:",
    "            ref: main",
    "            persist-credentials: false",
    "        - name: Enforce main-only release branch invariant",
    "          run: node scripts/check/check-release-branch-hygiene.mjs",
    "",
  ].join("\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.doesNotThrow(() => assertTrustedCheckoutBeforeGuard(prepare));
});

test("release checkout oracle rejects decoy guard text before the real guard", () => {
  const synthetic = [
    "jobs:",
    "  prepare:",
    "    steps:",
    "      - name: Decoy text",
    "        run: echo 'Enforce main-only release branch invariant'",
    "      - name: Checkout trusted release control plane",
    "        uses: actions/checkout@0123456789012345678901234567890123456789",
    "        with:",
    "          ref: main",
    "          persist-credentials: false",
    "      - name: Enforce main-only release branch invariant",
    "        run: node scripts/check/check-release-branch-hygiene.mjs",
    "",
  ].join("\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.doesNotThrow(() => assertTrustedCheckoutBeforeGuard(prepare));
});

test("release checkout oracle rejects duplicate branch-hygiene guard steps", () => {
  const synthetic = [
    "jobs:",
    "  prepare:",
    "    steps:",
    "      - name: Checkout trusted release control plane",
    "        uses: actions/checkout@0123456789012345678901234567890123456789",
    "        with:",
    "          ref: main",
    "          persist-credentials: false",
    "      - name: Enforce main-only release branch invariant",
    "        run: node scripts/check/check-release-branch-hygiene.mjs",
    "      - name: Enforce main-only release branch invariant",
    "        run: echo shadow",
    "",
  ].join("\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.throws(
    () => assertTrustedCheckoutBeforeGuard(prepare),
    /exactly one branch-hygiene guard/u
  );
});

test("release checkout oracle binds the named guard to the expected checker command", () => {
  const synthetic = [
    "jobs:",
    "  prepare:",
    "    steps:",
    "      - name: Checkout trusted release control plane",
    "        uses: actions/checkout@0123456789012345678901234567890123456789",
    "        with:",
    "          ref: main",
    "          persist-credentials: false",
    "      - name: Enforce main-only release branch invariant",
    "        run: echo bypass",
    "",
  ].join("\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.throws(() => assertTrustedCheckoutBeforeGuard(prepare), /must run the expected checker/u);
});

test("release oracle ignores fake checkout fields embedded inside a run block", () => {
  const synthetic = [
    "jobs:",
    "  prepare:",
    "    steps:",
    "      - name: Script containing fake checkout YAML",
    "        run: |",
    "          echo harmless",
    "          uses: actions/checkout@0123456789012345678901234567890123456789",
    "          ref: main",
    "          persist-credentials: false",
    "      - name: Enforce main-only release branch invariant",
    "        run: node scripts/check/check-release-branch-hygiene.mjs",
    "",
  ].join("\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.throws(
    () => assertTrustedCheckoutBeforeGuard(prepare),
    /exactly one actions\/checkout before the guard/u
  );
});

test("release oracle ignores a fake guard embedded inside a run block", () => {
  const synthetic = [
    "jobs:",
    "  prepare:",
    "    steps:",
    "      - name: Checkout trusted release control plane",
    "        uses: actions/checkout@0123456789012345678901234567890123456789",
    "        with:",
    "          ref: main",
    "          persist-credentials: false",
    "      - name: Script containing fake guard YAML",
    "        run: |",
    "          echo harmless",
    "          - name: Enforce main-only release branch invariant",
    "            run: node scripts/check/check-release-branch-hygiene.mjs",
    "",
  ].join("\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.throws(
    () => assertTrustedCheckoutBeforeGuard(prepare),
    /exactly one branch-hygiene guard/u
  );
});

test("release oracle ignores fake if text embedded in checkout inputs", () => {
  const condition = "${{ github.event_name == 'release' || inputs.publish_assets == true }}";
  const synthetic = [
    "jobs:",
    "  prepare:",
    "    steps:",
    "      - name: Checkout trusted release control plane",
    "        uses: actions/checkout@0123456789012345678901234567890123456789",
    "        with:",
    "          ref: main",
    "          persist-credentials: false",
    "          path: |",
    `            if: ${condition}`,
    "      - name: Enforce main-only release branch invariant",
    `        if: ${condition}`,
    "        run: node scripts/check/check-release-branch-hygiene.mjs",
    "",
  ].join("\n");
  const prepare = extractWorkflowJob(synthetic, "prepare");
  assert.throws(
    () => assertTrustedCheckoutBeforeGuard(prepare, condition),
    /checkout must use the intended release condition/u
  );
});
