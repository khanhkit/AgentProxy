import { execFileSync } from "node:child_process";
import { loadPortableJobs } from "./validate-portable-jobs.mjs";
import { runFallbackScheduler, waitForAttemptCompletion } from "./runner-fallback.mjs";
import { buildFallbackSummary } from "./summarize-runner-fallback.mjs";

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const argsAll = (name) =>
  process.argv.flatMap((value, index) =>
    value === `--${name}` && process.argv[index + 1] !== undefined ? [process.argv[index + 1]] : []
  );
const has = (name) => process.argv.includes(`--${name}`);

function gh(args) {
  return execFileSync("gh", ["api", "-H", "X-GitHub-Api-Version: 2026-03-10", ...args], {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN },
  });
}
function ghJson(args) {
  const out = gh(args);
  return out.trim() ? JSON.parse(out) : null;
}

export function parseWorkerInputs(values) {
  const parsed = {};
  for (const value of values) {
    const separator = value.indexOf("=");
    const key = separator >= 0 ? value.slice(0, separator) : "";
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) {
      throw new Error(`invalid worker input: ${value}`);
    }
    parsed[key] = value.slice(separator + 1);
  }
  return parsed;
}

export function buildWorkerDispatchArgs({ repo, workerWorkflow, workflowRef, inputs }) {
  if (!/^[A-Za-z0-9._-]+\.ya?ml$/.test(workerWorkflow)) {
    throw new Error(`invalid worker workflow: ${workerWorkflow}`);
  }
  const args = [
    "-X",
    "POST",
    `repos/${repo}/actions/workflows/${workerWorkflow}/dispatches`,
    "-f",
    `ref=${workflowRef}`,
  ];
  for (const [key, value] of Object.entries(inputs)) {
    if (value === undefined || value === null) continue;
    args.push("-f", `inputs[${key}]=${value}`);
  }
  return args;
}

export function createGitHubAdapter({
  repo,
  sourceSha,
  workflowRef,
  schedulerRunId,
  workerWorkflow = "portable-ci-worker.yml",
  workerInputs = {},
}) {
  const runById = new Map();
  const statusState = { pending: "pending", granted: "success", denied: "failure" };

  async function locate(attempt) {
    if (attempt.runId) return attempt.runId;
    const data = ghJson([
      `repos/${repo}/actions/workflows/${workerWorkflow}/runs?event=workflow_dispatch&branch=${encodeURIComponent(workflowRef)}&per_page=50`,
    ]);
    const run = data.workflow_runs.find((item) => item.display_title === attempt.runName);
    if (run) {
      attempt.runId = run.id;
      runById.set(run.id, attempt);
    }
    return attempt.runId;
  }

  return {
    now: () => Date.now() / 1000,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    async dispatchAttempt({ runner, claimContext, workload, attemptIndex }) {
      const attemptId = `${schedulerRunId}-${attemptIndex}`;
      const runName = `portable/${workload.id}/${attemptId}/${runner}`;
      const inputs = {
        ...workerInputs,
        logical_task: workload.id,
        runner,
        source_sha: sourceSha,
        attempt_id: attemptId,
        claim_context: claimContext,
      };
      gh(buildWorkerDispatchArgs({ repo, workerWorkflow, workflowRef, inputs }));
      return { runner, claimContext, attemptId, runName, runId: null };
    },
    async observeAttempt(attempt) {
      const runId = await locate(attempt);
      if (!runId) return { status: "queued" };
      const run = ghJson([`repos/${repo}/actions/runs/${runId}`]);
      const jobs = ghJson([`repos/${repo}/actions/runs/${runId}/jobs?per_page=20`]).jobs;
      if (!jobs.length) {
        return run.status === "completed"
          ? { status: "completed", conclusion: run.conclusion }
          : { status: "queued" };
      }
      const job = jobs.find((item) => item.name.startsWith("Portable ")) || jobs[0];
      return { status: job.status, conclusion: job.conclusion };
    },
    async setClaim(attempt, state) {
      const target = attempt.runId
        ? `https://github.com/${repo}/actions/runs/${attempt.runId}`
        : "";
      gh([
        "-X",
        "POST",
        `repos/${repo}/statuses/${sourceSha}`,
        "-f",
        `state=${statusState[state]}`,
        "-f",
        `context=${attempt.claimContext}`,
        "-f",
        `description=runner claim ${state}: ${attempt.runner}`,
        ...(target ? ["-f", `target_url=${target}`] : []),
      ]);
    },
    async cancelAttempt(attempt) {
      const runId = await locate(attempt);
      if (!runId) throw new Error(`cannot safely cancel unlocated attempt ${attempt.runName}`);
      gh(["-X", "POST", `repos/${repo}/actions/runs/${runId}/cancel`]);
    },
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const logicalTask = arg("logical-task");
  const sourceSha = arg("source-sha");
  const repo = process.env.GITHUB_REPOSITORY;
  const workflowRef = arg("workflow-ref", process.env.GITHUB_REF_NAME || "main");
  const workerWorkflow = arg("worker-workflow", "portable-ci-worker.yml");
  const workerInputs = parseWorkerInputs(argsAll("worker-input"));
  if (!repo || !logicalTask || !sourceSha) {
    throw new Error("GITHUB_REPOSITORY, --logical-task and --source-sha are required");
  }

  const manifest = await loadPortableJobs(arg("manifest", ".github/ci/portable-jobs.json"));
  const workload = manifest.jobs[logicalTask];
  if (!workload) throw new Error(`unknown logical task ${logicalTask}`);
  if (!workload.fallbackEnabled && !has("benchmark")) {
    throw new Error(
      `${logicalTask} fallback is not enabled; use --benchmark only for compatibility measurement`
    );
  }
  const runnable = {
    ...workload,
    id: logicalTask,
    queueTimeoutSeconds: workload.queueTimeoutSeconds ?? manifest.defaultQueueTimeoutSeconds,
  };
  const pollIntervalMs = Number(arg("poll-ms", "1000"));
  const adapter = createGitHubAdapter({
    repo,
    sourceSha,
    workflowRef,
    schedulerRunId: process.env.GITHUB_RUN_ID || String(Date.now()),
    workerWorkflow,
    workerInputs,
  });
  const result = await runFallbackScheduler(adapter, runnable, { sourceSha, pollIntervalMs });

  if (result.status === "started" && has("wait-completion")) {
    result.completion = await waitForAttemptCompletion(adapter, result.attempt, { pollIntervalMs });
  }

  const text = JSON.stringify(result, null, 2);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n${buildFallbackSummary(result)}\n`);
  }

  if (result.status !== "started") {
    process.exitCode = 1;
  } else if (result.completion && result.completion.conclusion !== "success") {
    process.exitCode = 1;
  }
}
