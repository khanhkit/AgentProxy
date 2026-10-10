import assert from "node:assert/strict";
import test from "node:test";

import {
  __getLifecycleHooksForTests,
  __resetLifecycleCoordinatorForTests,
} from "../../src/lib/lifecycle/coordinator.ts";

const graceful = await import("../../src/lib/gracefulShutdown.ts");

function hookMap(): Map<string, string> {
  return new Map(__getLifecycleHooksForTests().map((hook) => [hook.name, hook.phase]));
}

test("main runtime registers deterministic lifecycle phases before DB close", () => {
  __resetLifecycleCoordinatorForTests();
  globalThis.__agentproxyShutdown = undefined;
  globalThis.__agentproxyRequestShutdown = undefined;
  globalThis.__agentproxyCustomServerOwnsShutdown = true;

  graceful.initGracefulShutdown();
  const hooks = hookMap();

  const expected = new Map<string, string>([
    ["server-admission", "STOP_ADMISSION"],
    ["job-registry-scheduler", "STOP_SCHEDULERS"],
    ["batch-processor-scheduler", "STOP_SCHEDULERS"],
    ["provider-limits-scheduler", "STOP_SCHEDULERS"],
    ["runtime-config-scheduler", "STOP_SCHEDULERS"],
    ["job-registry-drain", "DRAIN_ACTIVE"],
    ["batch-processor-drain", "DRAIN_ACTIVE"],
    ["provider-limits-drain", "DRAIN_ACTIVE"],
    ["model-sync-drain", "DRAIN_ACTIVE"],
    ["runtime-config-drain", "DRAIN_ACTIVE"],
    ["service-supervisors-drain", "DRAIN_ACTIVE"],
    ["rate-limit-drain", "DRAIN_ACTIVE"],
    ["webhook-delivery-drain", "FLUSH_DURABLE"],
    ["spend-writer-flush", "FLUSH_DURABLE"],
    ["call-log-flush", "FLUSH_DURABLE"],
    ["routing-observability-flush", "FLUSH_DURABLE"],
    ["mcp-audit-db-close", "CLOSE_RESOURCES"],
    ["core-db-close", "CLOSE_RESOURCES"],
    ["vnc-sessions-stop", "STOP_CHILDREN"],
    ["chatgpt-web-runtime-stop", "STOP_CHILDREN"],
  ]);

  for (const [name, phase] of expected) {
    assert.equal(hooks.get(name), phase, `${name} must be registered in ${phase}`);
  }

  globalThis.__agentproxyCustomServerOwnsShutdown = undefined;
});
