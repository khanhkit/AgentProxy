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
