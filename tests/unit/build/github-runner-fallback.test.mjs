import assert from "node:assert/strict";
import test from "node:test";

import * as runnerFallback from "../../../scripts/ci/github-runner-fallback.mjs";
import {
  buildSchedulerRunId,
  buildWorkerDispatchArgs,
  parseWorkerInputs,
  interpretReadyStatus,
  retrySync,
  isRetryableGhRead,
} from "../../../scripts/ci/github-runner-fallback.mjs";

test("worker dispatch can target a dedicated workflow and carries only explicit scheduler inputs", () => {
  const args = buildWorkerDispatchArgs({
    repo: "khanhkit/AgentProxy",
    workerWorkflow: "ocr-review-worker.yml",
    workflowRef: "main",
    inputs: {
      logical_task: "ocr-review",
      runner: "ubuntu-latest",
      source_sha: "abc123",
      attempt_id: "42-1",
      claim_context: "agentproxy/runner-claim/ocr-review/abc123/1",
      ready_context: "agentproxy/runner-ready/ocr-review/abc123/1",
      pr_number: "94",
      base_ref: "main",
    },
  });

  assert.deepEqual(args.slice(0, 3), [
    "-X",
    "POST",
    "repos/khanhkit/AgentProxy/actions/workflows/ocr-review-worker.yml/dispatches",
  ]);
  assert.ok(args.includes("ref=main"));
  assert.ok(args.includes("inputs[pr_number]=94"));
  assert.ok(args.includes("inputs[ready_context]=agentproxy/runner-ready/ocr-review/abc123/1"));
  assert.ok(args.includes("inputs[base_ref]=main"));
  assert.equal(
    args.some((value) => value.includes("undefined")),
    false
  );
});

test("worker input parser accepts repeated NAME=VALUE pairs and rejects malformed keys", () => {
  assert.deepEqual(parseWorkerInputs(["pr_number=94", "base_ref=release/v3.8.51"]), {
    pr_number: "94",
    base_ref: "release/v3.8.51",
  });
  assert.throws(() => parseWorkerInputs(["bad key=value"]), /worker input/i);
  assert.throws(() => parseWorkerInputs(["missing-separator"]), /worker input/i);
});

test("runner readiness is keyed by the exact ready status context", () => {
  const statuses = [
    { context: "agentproxy/runner-ready/ocr-review/run-1/1", state: "success" },
    { context: "agentproxy/runner-ready/ocr-review/run-1/2", state: "pending" },
  ];
  assert.equal(interpretReadyStatus(statuses, "agentproxy/runner-ready/ocr-review/run-1/1"), true);
  assert.equal(interpretReadyStatus(statuses, "agentproxy/runner-ready/ocr-review/run-1/2"), false);
  assert.equal(interpretReadyStatus(statuses, "agentproxy/runner-ready/ocr-review/run-1/3"), false);
});

test("runner readiness scans commit-status pages until the exact context is found", () => {
  assert.equal(typeof runnerFallback.findReadyStatus, "function");
  const target = "agentproxy/runner-ready/ocr-review/run-1/1";
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    context: `unrelated/${index}`,
    state: "success",
  }));
  const pages = [];
  const ready = runnerFallback.findReadyStatus((page) => {
    pages.push(page);
    if (page === 1) return firstPage;
    if (page === 2) return [{ context: target, state: "success" }];
    return [];
  }, target);

  assert.equal(ready, true);
  assert.deepEqual(pages, [1, 2]);
});

test("GitHub API wrapper retries bounded transient failures without hiding terminal failure", () => {
  let calls = 0;
  const result = retrySync(() => {
    calls += 1;
    if (calls < 3) throw new Error("transient api parse failure");
    return "ok";
  }, 3);
  assert.equal(result, "ok");
  assert.equal(calls, 3);

  let failedCalls = 0;
  assert.throws(
    () =>
      retrySync(() => {
        failedCalls += 1;
        throw new Error("still broken");
      }, 3),
    /still broken/
  );
  assert.equal(failedCalls, 3);
});

test("scheduler run identity is unique across GitHub reruns", () => {
  assert.equal(buildSchedulerRunId({ GITHUB_RUN_ID: "37937387985", GITHUB_RUN_ATTEMPT: "1" }), "37937387985-1");
  assert.equal(buildSchedulerRunId({ GITHUB_RUN_ID: "37937387985", GITHUB_RUN_ATTEMPT: "2" }), "37937387985-2");
  assert.notEqual(
    buildSchedulerRunId({ GITHUB_RUN_ID: "37937387985", GITHUB_RUN_ATTEMPT: "1" }),
    buildSchedulerRunId({ GITHUB_RUN_ID: "37937387985", GITHUB_RUN_ATTEMPT: "2" })
  );
});

test("only read-only GitHub API calls are eligible for automatic retry", () => {
  assert.equal(isRetryableGhRead(["repos/o/r/actions/runs/1"]), true);
  assert.equal(isRetryableGhRead(["repos/o/r/commits/abc/statuses?per_page=100"]), true);
  assert.equal(
    isRetryableGhRead(["-X", "POST", "repos/o/r/actions/workflows/w.yml/dispatches"]),
    false
  );
  assert.equal(isRetryableGhRead(["-X", "POST", "repos/o/r/statuses/abc"]), false);
  assert.equal(isRetryableGhRead(["-X", "POST", "repos/o/r/actions/runs/1/cancel"]), false);
});
