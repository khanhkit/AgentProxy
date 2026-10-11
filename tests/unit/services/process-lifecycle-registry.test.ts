import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const registryUrl = pathToFileURL(join(process.cwd(), "src/lib/services/registry.ts")).href;

test("service registry import does not claim SIGINT/SIGTERM ownership", async () => {
  const beforeInt = process.listenerCount("SIGINT");
  const beforeTerm = process.listenerCount("SIGTERM");

  const registry = await import(`${registryUrl}?lifecycle-owner=${Date.now()}`);

  assert.equal(process.listenerCount("SIGINT"), beforeInt);
  assert.equal(process.listenerCount("SIGTERM"), beforeTerm);
  assert.equal(typeof registry.stopAllSupervisors, "function");
});

test("service registry propagates supervisor stop failures after settling every supervisor", async () => {
  const registry = await import(`${registryUrl}?stop-failures=${Date.now()}`);
  const stopped: string[] = [];
  registry.registerSupervisor({
    getStatus: () => ({ tool: "ok" }),
    stop: async () => {
      stopped.push("ok");
    },
  } as never);
  registry.registerSupervisor({
    getStatus: () => ({ tool: "bad" }),
    stop: async () => {
      stopped.push("bad");
      throw new Error("persist failed");
    },
  } as never);

  await assert.rejects(
    () => registry.stopAllSupervisors(),
    /persist failed|Supervisor shutdown failed/
  );
  assert.deepEqual(stopped.sort(), ["bad", "ok"]);
});
