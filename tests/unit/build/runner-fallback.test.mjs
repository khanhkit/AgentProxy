import assert from "node:assert/strict";
import test from "node:test";
import {
  decideAttemptAction,
  runFallbackScheduler,
  waitForAttemptCompletion,
} from "../../../scripts/ci/runner-fallback.mjs";

test("decision waits while queued before timeout", () => {
  assert.deepEqual(
    decideAttemptAction({
      status: "queued",
      elapsedSeconds: 44,
      queueTimeoutSeconds: 45,
      claim: "unset",
    }),
    { action: "wait" }
  );
});

test("decision grants claim when runner starts before timeout", () => {
  assert.deepEqual(
    decideAttemptAction({
      status: "in_progress",
      elapsedSeconds: 20,
      queueTimeoutSeconds: 45,
      claim: "unset",
    }),
    { action: "grant" }
  );
});

test("decision times out only a still queued attempt", () => {
  assert.deepEqual(
    decideAttemptAction({
      status: "queued",
      elapsedSeconds: 45,
      queueTimeoutSeconds: 45,
      claim: "unset",
    }),
    { action: "deny-and-cancel" }
  );
});

test("after deny, an assignment race never grants workload execution", () => {
  assert.deepEqual(
    decideAttemptAction({
      status: "in_progress",
      elapsedSeconds: 46,
      queueTimeoutSeconds: 45,
      claim: "denied",
    }),
    { action: "wait-for-terminal-cancel" }
  );
});

test("task completion/failure after execution never falls back", () => {
  assert.deepEqual(
    decideAttemptAction({
      status: "completed",
      conclusion: "failure",
      elapsedSeconds: 80,
      queueTimeoutSeconds: 45,
      claim: "granted",
    }),
    { action: "terminal", conclusion: "failure" }
  );
});

function fakeAdapter(scenarios) {
  let now = 0,
    attemptNo = 0;
  const calls = [];
  return {
    calls,
    now: () => now,
    sleep: async (ms) => {
      now += ms / 1000;
    },
    dispatchAttempt: async ({ runner, claimContext }) => {
      const attempt = { id: `a${++attemptNo}`, runner, claimContext };
      calls.push(["dispatch", runner]);
      return attempt;
    },
    observeAttempt: async (attempt) => {
      const seq = scenarios[attempt.runner];
      const obs = seq.length > 1 ? seq.shift() : seq[0];
      calls.push(["observe", attempt.runner, obs.status, obs.conclusion ?? null]);
      return obs;
    },
    setClaim: async (attempt, state) => {
      calls.push(["claim", attempt.runner, state]);
    },
    cancelAttempt: async (attempt) => {
      calls.push(["cancel", attempt.runner]);
    },
  };
}

test("scheduler rejects missing claim nonce so stale claims cannot be replayed", async () => {
  await assert.rejects(
    () =>
      runFallbackScheduler(
        fakeAdapter({ "ubuntu-latest": [{ status: "in_progress" }] }),
        {
          id: "ocr-review",
          compatibleRunners: ["ubuntu-latest"],
          queueTimeoutSeconds: 45,
        },
        { sourceSha: "abc" }
      ),
    /claimNonce is required/
  );
});

test("claim context is unique per scheduler run even when source SHA is unchanged", async () => {
  const workload = {
    id: "ocr-review",
    compatibleRunners: ["ubuntu-latest"],
    queueTimeoutSeconds: 45,
  };
  const first = await runFallbackScheduler(
    fakeAdapter({ "ubuntu-latest": [{ status: "in_progress" }] }),
    workload,
    { sourceSha: "abc", claimNonce: "run-101" }
  );
  const second = await runFallbackScheduler(
    fakeAdapter({ "ubuntu-latest": [{ status: "in_progress" }] }),
    workload,
    { sourceSha: "abc", claimNonce: "run-102" }
  );
  assert.notEqual(first.attempt.claimContext, second.attempt.claimContext);
  assert.match(first.attempt.claimContext, /\/run-101\/1$/);
  assert.match(second.attempt.claimContext, /\/run-102\/1$/);
});

test("scheduler selects first runner that starts and never dispatches another", async () => {
  const a = fakeAdapter({
    "ubuntu-24.04-arm": [{ status: "queued" }, { status: "in_progress" }],
    "ubuntu-latest": [{ status: "queued" }],
  });
  const result = await runFallbackScheduler(
    a,
    {
      id: "vitest",
      compatibleRunners: ["ubuntu-24.04-arm", "ubuntu-latest"],
      queueTimeoutSeconds: 45,
    },
    { sourceSha: "abc", pollIntervalMs: 1000, claimNonce: "test-run" }
  );
  assert.equal(result.status, "started");
  assert.equal(result.runner, "ubuntu-24.04-arm");
  assert.deepEqual(
    a.calls.filter((c) => c[0] === "dispatch"),
    [["dispatch", "ubuntu-24.04-arm"]]
  );
  assert.ok(a.calls.some((c) => c[0] === "claim" && c[2] === "granted"));
});

test("scheduler denies, cancels and confirms terminal cancellation before next runner", async () => {
  const queued = Array.from({ length: 46 }, () => ({ status: "queued" }));
  queued.push({ status: "completed", conclusion: "cancelled" });
  const a = fakeAdapter({
    "ubuntu-24.04-arm": queued,
    "ubuntu-latest": [{ status: "in_progress" }],
  });
  const result = await runFallbackScheduler(
    a,
    {
      id: "vitest",
      compatibleRunners: ["ubuntu-24.04-arm", "ubuntu-latest"],
      queueTimeoutSeconds: 45,
    },
    { sourceSha: "abc", pollIntervalMs: 1000, claimNonce: "test-run" }
  );
  assert.equal(result.runner, "ubuntu-latest");
  const deny = a.calls.findIndex(
    (c) => c[0] === "claim" && c[1] === "ubuntu-24.04-arm" && c[2] === "denied"
  );
  const cancel = a.calls.findIndex((c) => c[0] === "cancel" && c[1] === "ubuntu-24.04-arm");
  const second = a.calls.findIndex((c) => c[0] === "dispatch" && c[1] === "ubuntu-latest");
  assert.ok(deny >= 0 && cancel > deny && second > cancel);
});

test("assignment race after timeout stays denied until cancelled, then falls back", async () => {
  const queued = Array.from({ length: 46 }, () => ({ status: "queued" }));
  queued.push({ status: "in_progress" }, { status: "completed", conclusion: "cancelled" });
  const a = fakeAdapter({
    "ubuntu-24.04-arm": queued,
    "ubuntu-latest": [{ status: "in_progress" }],
  });
  const result = await runFallbackScheduler(
    a,
    {
      id: "vitest",
      compatibleRunners: ["ubuntu-24.04-arm", "ubuntu-latest"],
      queueTimeoutSeconds: 45,
    },
    { sourceSha: "abc", pollIntervalMs: 1000, claimNonce: "test-run" }
  );
  assert.equal(result.runner, "ubuntu-latest");
  assert.equal(
    a.calls.filter((c) => c[0] === "claim" && c[1] === "ubuntu-24.04-arm" && c[2] === "granted")
      .length,
    0
  );
});

test("API observation failure fails closed without dispatching another runner", async () => {
  const a = fakeAdapter({
    "ubuntu-24.04-arm": [{ status: "queued" }],
    "ubuntu-latest": [{ status: "in_progress" }],
  });
  a.observeAttempt = async () => {
    throw new Error("rate limit");
  };
  await assert.rejects(
    () =>
      runFallbackScheduler(
        a,
        {
          id: "vitest",
          compatibleRunners: ["ubuntu-24.04-arm", "ubuntu-latest"],
          queueTimeoutSeconds: 45,
        },
        { sourceSha: "abc", claimNonce: "test-run" }
      ),
    /rate limit/
  );
  assert.deepEqual(
    a.calls.filter((c) => c[0] === "dispatch"),
    [["dispatch", "ubuntu-24.04-arm"]]
  );
});

test("exhausted compatible runners returns explicit exhausted result", async () => {
  const q1 = Array.from({ length: 46 }, () => ({ status: "queued" }));
  q1.push({ status: "completed", conclusion: "cancelled" });
  const q2 = Array.from({ length: 46 }, () => ({ status: "queued" }));
  q2.push({ status: "completed", conclusion: "cancelled" });
  const a = fakeAdapter({ "ubuntu-24.04-arm": q1, "ubuntu-latest": q2 });
  const result = await runFallbackScheduler(
    a,
    {
      id: "vitest",
      compatibleRunners: ["ubuntu-24.04-arm", "ubuntu-latest"],
      queueTimeoutSeconds: 45,
    },
    { sourceSha: "abc", pollIntervalMs: 1000, claimNonce: "test-run" }
  );
  assert.equal(result.status, "exhausted");
  assert.equal(result.attempts.length, 2);
});

test("completed task failure is terminal and does not dispatch fallback runner", async () => {
  const a = fakeAdapter({
    "ubuntu-24.04-arm": [{ status: "completed", conclusion: "failure" }],
    "ubuntu-latest": [{ status: "in_progress" }],
  });
  const result = await runFallbackScheduler(
    a,
    {
      id: "vitest",
      compatibleRunners: ["ubuntu-24.04-arm", "ubuntu-latest"],
      queueTimeoutSeconds: 45,
    },
    { sourceSha: "abc", claimNonce: "test-run" }
  );
  assert.equal(result.status, "terminal");
  assert.equal(result.conclusion, "failure");
  assert.deepEqual(
    a.calls.filter((c) => c[0] === "dispatch"),
    [["dispatch", "ubuntu-24.04-arm"]]
  );
});

test("completion waiter keeps polling the granted attempt until terminal success", async () => {
  const a = fakeAdapter({
    "ubuntu-latest": [
      { status: "in_progress" },
      { status: "in_progress" },
      { status: "completed", conclusion: "success" },
    ],
  });
  const attempt = { id: "chosen", runner: "ubuntu-latest", claimContext: "ctx" };
  const result = await waitForAttemptCompletion(a, attempt, { pollIntervalMs: 1000 });
  assert.deepEqual(result, { status: "completed", conclusion: "success" });
  assert.equal(a.calls.filter((c) => c[0] === "observe").length, 3);
});

test("completion waiter preserves selected worker failure instead of treating start as green", async () => {
  const a = fakeAdapter({
    "ubuntu-latest": [{ status: "in_progress" }, { status: "completed", conclusion: "failure" }],
  });
  const attempt = { id: "chosen", runner: "ubuntu-latest", claimContext: "ctx" };
  const result = await waitForAttemptCompletion(a, attempt, { pollIntervalMs: 1000 });
  assert.deepEqual(result, { status: "completed", conclusion: "failure" });
});
