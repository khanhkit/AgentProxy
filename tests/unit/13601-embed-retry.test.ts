// #13601.3: a failed memory vector embedding write must be retried once
// before it is logged and queued for reindex — a single transient failure
// (slow potion load, brief remote 5xx) should not silently skip vectorization.
import { test } from "node:test";
import assert from "node:assert/strict";

const { embedWithRetry } = await import("../../src/lib/memory/embedding/index.ts");

type EmbedResult = { vector: number[] } | { reason: string; message: string };

const settings = {} as Parameters<typeof embedWithRetry>[1];

test("#13601.3: success on the first attempt performs exactly one embed", async () => {
  let calls = 0;
  const result = (await embedWithRetry("hello", settings, async () => {
    calls += 1;
    return { vector: [1, 2, 3] };
  })) as EmbedResult;
  assert.equal(calls, 1);
  assert.ok("vector" in result);
});

test("#13601.3: a transient first failure is retried and can still succeed", async () => {
  let calls = 0;
  const result = (await embedWithRetry("hello", settings, async () => {
    calls += 1;
    if (calls === 1) return { reason: "request_failed", message: "boom" };
    return { vector: [1, 2, 3] };
  })) as EmbedResult;
  assert.equal(calls, 2);
  assert.ok("vector" in result);
});

test("#13601.3: a persistent failure surfaces the last error after one retry", async () => {
  let calls = 0;
  const result = (await embedWithRetry("hello", settings, async () => {
    calls += 1;
    return { reason: "request_failed", message: `boom-${calls}` };
  })) as EmbedResult;
  assert.equal(calls, 2);
  assert.ok(!("vector" in result));
  if (!("vector" in result)) assert.equal(result.message, "boom-2");
});

test("deterministic embedding errors are returned without repeated attempts", async () => {
  for (const reason of ["no_key", "unknown", "invalid_config"] as const) {
    let calls = 0;
    const result = (await embedWithRetry(
      "hello",
      settings,
      async () => {
        calls += 1;
        return { reason, message: "configuration unavailable" };
      },
      3
    )) as EmbedResult;
    assert.equal(calls, 1, reason);
    assert.ok(!("vector" in result));
  }
});

test("invalid custom embedding configuration fails without a remote request", async () => {
  const result = await embedWithRetry("hello", {
    embeddingSource: "remote",
    customBaseUrl: "not-a-url",
    customModelId: "test-model",
  } as Parameters<typeof embedWithRetry>[1]);
  assert.ok(!("vector" in result));
  if (!("vector" in result)) assert.equal(result.reason, "invalid_config");
});
