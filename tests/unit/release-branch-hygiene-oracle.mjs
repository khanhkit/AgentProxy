import assert from "node:assert/strict";
import { load as loadYaml } from "js-yaml";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractWorkflowJob(yaml, jobName) {
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

export function assertTrustedCheckoutBeforeGuard(jobText, expectedCondition = null) {
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

  const checkoutIndexes = steps.flatMap((step, index) => {
    if (index >= guardIndex || !isRecord(step) || typeof step.uses !== "string") return [];
    return step.uses.startsWith("actions/checkout@") ? [index] : [];
  });
  assert.equal(
    checkoutIndexes.length,
    1,
    "release prepare job must contain exactly one actions/checkout before the guard"
  );
  const checkoutIndex = checkoutIndexes[0];
  assert.equal(
    checkoutIndex + 1,
    guardIndex,
    "trusted release checkout must immediately precede the branch-hygiene guard"
  );
  const checkoutStep = steps[checkoutIndex];
  assert.ok(isRecord(checkoutStep), "release checkout must be a step mapping");
  assert.match(
    String(checkoutStep.uses),
    /^actions\/checkout@[0-9a-f]{40}$/u,
    "release prepare job must use a SHA-pinned actions/checkout"
  );

  const checkoutWith = isRecord(checkoutStep.with) ? checkoutStep.with : {};
  assert.deepEqual(
    Object.keys(checkoutWith).sort(),
    ["persist-credentials", "ref"],
    "release control-plane checkout must use only trusted checkout inputs"
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
