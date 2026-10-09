import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkerDispatchArgs,
  parseWorkerInputs,
  interpretReadyStatus,
  retrySync,
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
