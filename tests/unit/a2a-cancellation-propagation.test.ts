import assert from "node:assert/strict";
import test from "node:test";

import { A2ATaskManager, type A2APersistence } from "../../src/lib/a2a/taskManager.ts";
import { A2A_SKILL_HANDLERS, executeA2ATaskWithState } from "../../src/lib/a2a/taskExecution.ts";
import { createA2AStream } from "../../src/lib/a2a/streaming.ts";

const persistence: A2APersistence = {
  upsert: (() => {}) as A2APersistence["upsert"],
  appendEvent: (() => {}) as A2APersistence["appendEvent"],
  purge: (() => 0) as A2APersistence["purge"],
};

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("tasks/cancel aborts active A2A provider work and cancelled stays terminal", async () => {
  const tm = new A2ATaskManager(5, persistence);
  const task = tm.createTask({
    skill: "fake-long-provider",
    messages: [{ role: "user", content: "hold this request open" }],
  });
  tm.updateTask(task.id, "working");

  const started = deferred();
  let observedSignal: AbortSignal | undefined;
  let providerReleased = false;
  let postCancelSideEffect = false;

  const execution = executeA2ATaskWithState(
    tm,
    task,
    async (_task, signal?: AbortSignal) => {
      observedSignal = signal;
      started.resolve();

      if (!signal) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        postCancelSideEffect = true;
        return { artifacts: [], metadata: {} };
      }

      await new Promise<void>((_resolve, reject) => {
        if (signal.aborted) {
          providerReleased = true;
          reject(signal.reason ?? new Error("cancelled"));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            providerReleased = true;
            reject(signal.reason ?? new Error("cancelled"));
          },
          { once: true }
        );
      });

      postCancelSideEffect = true;
      return { artifacts: [], metadata: {} };
    },
    { search: async () => [] }
  );

  await started.promise;
  const cancelled = tm.cancelTask(task.id);

  assert.equal(cancelled.state, "cancelled");
  await assert.rejects(execution);
  assert.ok(observedSignal, "active handler must receive a task-owned AbortSignal");
  assert.equal(observedSignal.aborted, true, "tasks/cancel must abort the active execution signal");
  assert.equal(
    providerReleased,
    true,
    "the fake provider must release promptly after cancellation"
  );
  assert.equal(postCancelSideEffect, false, "provider side effects must stop after cancellation");
  assert.equal(task.state, "cancelled", "cancelled must remain the terminal state");
  assert.deepEqual(
    task.events.map((event) => event.state),
    ["submitted", "working", "cancelled"],
    "execution must not append completed/failed after cancellation"
  );

  tm.destroy();
});

test("tasks/cancel aborts the real smart-routing provider fetch", async () => {
  const tm = new A2ATaskManager(5, persistence);
  const task = tm.createTask({
    skill: "smart-routing",
    messages: [{ role: "user", content: "route this request" }],
  });
  tm.updateTask(task.id, "working");

  const originalFetch = globalThis.fetch;
  const fetchStarted = deferred();
  let providerSignal: AbortSignal | undefined;
  let providerReleased = false;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    providerSignal = init?.signal ?? undefined;
    fetchStarted.resolve();
    return await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("provider fetch did not receive a signal"));
        return;
      }
      if (signal.aborted) {
        providerReleased = true;
        reject(signal.reason ?? new Error("cancelled"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          providerReleased = true;
          reject(signal.reason ?? new Error("cancelled"));
        },
        { once: true }
      );
    });
  }) as typeof fetch;

  try {
    const execution = executeA2ATaskWithState(tm, task, A2A_SKILL_HANDLERS["smart-routing"], {
      search: async () => [],
    });

    await fetchStarted.promise;
    tm.cancelTask(task.id);

    await assert.rejects(execution);
    assert.ok(providerSignal, "smart-routing fetch must receive a cancellation-aware signal");
    assert.equal(providerSignal.aborted, true);
    assert.equal(providerReleased, true, "provider fetch must release when the task is cancelled");
    assert.equal(task.state, "cancelled");
  } finally {
    globalThis.fetch = originalFetch;
    tm.destroy();
  }
});

test("stream disconnect cancels active provider work and emits cancelled terminal state", async () => {
  const tm = new A2ATaskManager(5, persistence);
  const task = tm.createTask({
    skill: "fake-long-provider",
    messages: [{ role: "user", content: "stream this request" }],
  });
  tm.updateTask(task.id, "working");

  const requestController = new AbortController();
  const started = deferred();
  let providerReleased = false;

  const stream = createA2AStream(
    task,
    async (activeTask) =>
      executeA2ATaskWithState(
        tm,
        activeTask,
        async (_task, signal?: AbortSignal) => {
          started.resolve();
          if (!signal) throw new Error("missing execution signal");
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                providerReleased = true;
                reject(signal.reason ?? new Error("cancelled"));
              },
              { once: true }
            );
          });
          return { artifacts: [], metadata: {} };
        },
        { search: async () => [] },
        requestController.signal
      ),
    requestController.signal
  );

  const reader = stream.getReader();
  await started.promise;
  requestController.abort(new Error("client disconnected"));

  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
  }
  output += decoder.decode();

  assert.equal(providerReleased, true, "request abort must release active provider work");
  assert.equal(task.state, "cancelled", "request abort must terminate the task as cancelled");
  assert.match(output, /"state":"cancelled"/);
  assert.doesNotMatch(output, /"state":"failed"/);

  tm.destroy();
});
