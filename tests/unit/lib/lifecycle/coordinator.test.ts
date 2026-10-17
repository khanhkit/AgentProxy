import assert from "node:assert/strict";
import test from "node:test";

import {
  __getLifecycleHooksForTests,
  __resetLifecycleCoordinatorForTests,
  LIFECYCLE_PHASES,
  registerLifecycleHook,
  runLifecycleShutdown,
} from "@/lib/lifecycle/coordinator.ts";

test.beforeEach(() => {
  __resetLifecycleCoordinatorForTests();
});

test.after(() => {
  __resetLifecycleCoordinatorForTests();
});

test("runs lifecycle phases in strict order", async () => {
  const order: string[] = [];
  registerLifecycleHook({
    name: "close",
    phase: "CLOSE_RESOURCES",
    run: () => order.push("close"),
  });
  registerLifecycleHook({
    name: "admission",
    phase: "STOP_ADMISSION",
    run: () => order.push("admission"),
  });
  registerLifecycleHook({ name: "drain", phase: "DRAIN_ACTIVE", run: () => order.push("drain") });
  registerLifecycleHook({ name: "flush", phase: "FLUSH_DURABLE", run: () => order.push("flush") });
  registerLifecycleHook({
    name: "scheduler",
    phase: "STOP_SCHEDULERS",
    run: () => order.push("scheduler"),
  });
  registerLifecycleHook({ name: "child", phase: "STOP_CHILDREN", run: () => order.push("child") });

  const report = await runLifecycleShutdown({ timeoutMs: 500 });

  assert.deepEqual(order, ["admission", "scheduler", "drain", "flush", "close", "child"]);
  assert.equal(report.clean, true);
  assert.equal(report.results.length, 6);
});

test("background work drains after active producers and before durable flush", () => {
  assert.deepEqual(LIFECYCLE_PHASES, [
    "STOP_ADMISSION",
    "STOP_SCHEDULERS",
    "DRAIN_ACTIVE",
    "DRAIN_BACKGROUND",
    "FLUSH_DURABLE",
    "CLOSE_RESOURCES",
    "STOP_CHILDREN",
  ]);
});
test("starts hooks in the same phase concurrently", async () => {
  const started: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  registerLifecycleHook({
    name: "a",
    phase: "DRAIN_ACTIVE",
    run: async () => {
      started.push("a");
      await gate;
    },
  });
  registerLifecycleHook({
    name: "b",
    phase: "DRAIN_ACTIVE",
    run: async () => {
      started.push("b");
      await gate;
    },
  });

  const shutdown = runLifecycleShutdown({ timeoutMs: 500 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(started.sort(), ["a", "b"]);
  release();
  const report = await shutdown;
  assert.equal(report.clean, true);
});

test("continues to later phases after a hook rejects", async () => {
  const order: string[] = [];
  registerLifecycleHook({
    name: "broken-drain",
    phase: "DRAIN_ACTIVE",
    run: async () => {
      order.push("drain");
      throw new Error("boom");
    },
  });
  registerLifecycleHook({
    name: "durable-flush",
    phase: "FLUSH_DURABLE",
    run: () => order.push("flush"),
  });

  const report = await runLifecycleShutdown({ timeoutMs: 500 });

  assert.deepEqual(order, ["drain", "flush"]);
  assert.equal(report.clean, false);
  assert.equal(report.results.find((entry) => entry.name === "broken-drain")?.status, "rejected");
  assert.equal(report.results.find((entry) => entry.name === "durable-flush")?.status, "ok");
});

test("uses one global deadline and skips later hooks after it expires", async () => {
  registerLifecycleHook({
    name: "slow",
    phase: "DRAIN_ACTIVE",
    run: () => new Promise<void>(() => {}),
  });
  registerLifecycleHook({ name: "late", phase: "FLUSH_DURABLE", run: () => undefined });

  const startedAt = Date.now();
  const report = await runLifecycleShutdown({ timeoutMs: 30 });
  const elapsed = Date.now() - startedAt;

  assert.ok(elapsed >= 20, `deadline returned too early: ${elapsed}ms`);
  assert.ok(elapsed < 200, `deadline was reset or ignored: ${elapsed}ms`);
  assert.equal(report.clean, false);
  assert.equal(report.results.find((entry) => entry.name === "slow")?.status, "timed_out");
  assert.equal(report.results.find((entry) => entry.name === "late")?.status, "skipped_deadline");
});

test("duplicate hook names replace rather than accumulate across module reloads", () => {
  const unregisterFirst = registerLifecycleHook({
    name: "same",
    phase: "DRAIN_ACTIVE",
    run: () => undefined,
  });
  registerLifecycleHook({ name: "same", phase: "FLUSH_DURABLE", run: () => undefined });

  assert.deepEqual(
    __getLifecycleHooksForTests().map(({ name, phase }) => ({ name, phase })),
    [{ name: "same", phase: "FLUSH_DURABLE" }]
  );

  unregisterFirst();
  assert.equal(
    __getLifecycleHooksForTests().length,
    1,
    "stale unregister must not delete replacement"
  );
});
