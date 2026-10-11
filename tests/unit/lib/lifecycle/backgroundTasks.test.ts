import assert from "node:assert/strict";
import test from "node:test";

import {
  __getLifecycleBackgroundTaskCountForTests,
  __resetLifecycleBackgroundTasksForTests,
  drainLifecycleBackgroundTasks,
  trackLifecycleBackgroundTask,
} from "../../../../src/lib/lifecycle/backgroundTasks.ts";

test("tracked background work remains drainable through settlement", async () => {
  __resetLifecycleBackgroundTasksForTests();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tracked = trackLifecycleBackgroundTask("db-writer", pending);
  assert.equal(__getLifecycleBackgroundTaskCountForTests(), 1);

  let drained = false;
  const drain = drainLifecycleBackgroundTasks().then(() => {
    drained = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(drained, false);

  release();
  await tracked;
  await drain;
  assert.equal(__getLifecycleBackgroundTaskCountForTests(), 0);
});

test("a rejected background task does not make lifecycle drain reject", async () => {
  __resetLifecycleBackgroundTasksForTests();
  const tracked = trackLifecycleBackgroundTask("rejected", Promise.reject(new Error("boom")));
  await assert.rejects(tracked, /boom/);
  await drainLifecycleBackgroundTasks();
  assert.equal(__getLifecycleBackgroundTaskCountForTests(), 0);
});
