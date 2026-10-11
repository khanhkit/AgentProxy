import test from "node:test";
import assert from "node:assert/strict";

import {
  activateRuntimeConfigCandidate,
  getActiveRuntimeConfigSnapshot,
  getRuntimeConfigStatus,
  resetRuntimeConfigAuthorityForTests,
  type RuntimeConfigCandidate,
} from "../../src/lib/config/runtimeConfigAuthority.ts";
import { classifyRuntimeSettingKey } from "../../src/lib/config/runtimeSettingClassification.ts";

function candidate(
  revision: number,
  settings: Record<string, unknown> = {},
  featureFlagOverrides: Record<string, string> = {}
): RuntimeConfigCandidate {
  return { revision, settings, featureFlagOverrides };
}

test.beforeEach(() => {
  resetRuntimeConfigAuthorityForTests();
});

test("first successful candidate publishes one deeply frozen active snapshot", async () => {
  const input = candidate(
    1,
    { nested: { enabled: true }, list: ["a", "b"] },
    { PII_REDACTION_ENABLED: "true" }
  );

  await activateRuntimeConfigCandidate(input, {});
  const snapshot = getActiveRuntimeConfigSnapshot();

  assert.equal(snapshot?.revision, 1);
  assert.deepEqual(snapshot?.settings, input.settings);
  assert.deepEqual(snapshot?.featureFlagOverrides, input.featureFlagOverrides);
  assert.notEqual(snapshot?.settings, input.settings);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot?.settings), true);
  assert.equal(Object.isFrozen(snapshot?.settings.nested as object), true);
  assert.equal(Object.isFrozen(snapshot?.settings.list as object), true);
  assert.equal(Object.isFrozen(snapshot?.featureFlagOverrides), true);
  assert.deepEqual(getRuntimeConfigStatus(), {
    desiredRevision: 1,
    activeRevision: 1,
    state: "ready",
    lastError: null,
    restartRequiredKeys: [],
    reconcileRevision: null,
  });
});

test("stale revision is a no-op and cannot replace newer active state", async () => {
  await activateRuntimeConfigCandidate(candidate(2, { marker: "new" }), {});
  let atomicCalls = 0;

  await activateRuntimeConfigCandidate(candidate(1, { marker: "old" }), {
    applyAtomic: async () => {
      atomicCalls++;
    },
  });

  assert.equal(atomicCalls, 0);
  assert.equal(getActiveRuntimeConfigSnapshot()?.revision, 2);
  assert.equal(getActiveRuntimeConfigSnapshot()?.settings.marker, "new");
  assert.equal(getRuntimeConfigStatus().desiredRevision, 2);
});

test("same revision is idempotent when reconcile is not pending", async () => {
  let atomicCalls = 0;
  let reconcileCalls = 0;
  const hooks = {
    applyAtomic: async () => {
      atomicCalls++;
    },
    reconcile: async () => {
      reconcileCalls++;
    },
  };

  await activateRuntimeConfigCandidate(candidate(3, { marker: "same" }), hooks);
  await activateRuntimeConfigCandidate(candidate(3, { marker: "same" }), hooks);

  assert.equal(atomicCalls, 1);
  assert.equal(reconcileCalls, 1);
});

test("HOT_ATOMIC failure rolls back and leaves previous active snapshot intact", async () => {
  await activateRuntimeConfigCandidate(candidate(4, { marker: "known-good" }), {});
  const previous = getActiveRuntimeConfigSnapshot();
  const calls: string[] = [];

  await assert.rejects(
    activateRuntimeConfigCandidate(candidate(5, { marker: "broken" }), {
      prepare: async () => {
        calls.push("prepare");
        return { prepared: true };
      },
      applyAtomic: async () => {
        calls.push("apply");
        throw new Error("atomic boom");
      },
      rollbackAtomic: async (_prepared, prior) => {
        calls.push(`rollback:${prior?.revision ?? "none"}`);
      },
    }),
    /atomic boom/
  );

  assert.deepEqual(calls, ["prepare", "apply", "rollback:4"]);
  assert.equal(getActiveRuntimeConfigSnapshot(), previous);
  assert.equal(getRuntimeConfigStatus().desiredRevision, 5);
  assert.equal(getRuntimeConfigStatus().activeRevision, 4);
  assert.equal(getRuntimeConfigStatus().state, "activation_failed");
  assert.deepEqual(getRuntimeConfigStatus().lastError, {
    revision: 5,
    message: "atomic boom",
  });
});

test("reconcile failure keeps active snapshot and same revision retries reconcile only", async () => {
  let atomicCalls = 0;
  let reconcileCalls = 0;
  let fail = true;
  const hooks = {
    applyAtomic: async () => {
      atomicCalls++;
    },
    reconcile: async () => {
      reconcileCalls++;
      if (fail) throw new Error("reconcile boom");
    },
  };

  await activateRuntimeConfigCandidate(candidate(6, { marker: "active" }), hooks);

  assert.equal(getActiveRuntimeConfigSnapshot()?.revision, 6);
  assert.equal(getRuntimeConfigStatus().state, "reconcile_pending");
  assert.equal(getRuntimeConfigStatus().reconcileRevision, 6);
  assert.deepEqual(getRuntimeConfigStatus().lastError, {
    revision: 6,
    message: "reconcile boom",
  });

  fail = false;
  await activateRuntimeConfigCandidate(candidate(6, { marker: "active" }), hooks);

  assert.equal(atomicCalls, 1);
  assert.equal(reconcileCalls, 2);
  assert.equal(getRuntimeConfigStatus().state, "ready");
  assert.equal(getRuntimeConfigStatus().reconcileRevision, null);
  assert.equal(getRuntimeConfigStatus().lastError, null);
});

test("older reconcile completion cannot clear newer revision status", async () => {
  let releaseRevision7!: () => void;
  const revision7Blocked = new Promise<void>((resolve) => {
    releaseRevision7 = resolve;
  });

  const first = activateRuntimeConfigCandidate(candidate(7, { marker: "seven" }), {
    reconcile: async () => {
      await revision7Blocked;
    },
  });

  // Let revision 7 publish before revision 8 activates while its reconcile is blocked.
  await new Promise<void>((resolve) => setImmediate(resolve));

  await activateRuntimeConfigCandidate(candidate(8, { marker: "eight" }), {
    reconcile: async () => {
      throw new Error("revision 8 reconcile pending");
    },
  });

  releaseRevision7();
  await first;

  assert.equal(getActiveRuntimeConfigSnapshot()?.revision, 8);
  assert.equal(getRuntimeConfigStatus().state, "reconcile_pending");
  assert.equal(getRuntimeConfigStatus().reconcileRevision, 8);
  assert.deepEqual(getRuntimeConfigStatus().lastError, {
    revision: 8,
    message: "revision 8 reconcile pending",
  });
});

test("classification uses explicit reconcile, restart and build/deploy exceptions", () => {
  assert.equal(classifyRuntimeSettingKey("debugMode"), "HOT_ATOMIC");
  assert.equal(classifyRuntimeSettingKey("modelsDevSyncEnabled"), "HOT_RECONCILE");
  assert.equal(classifyRuntimeSettingKey("modelsDevSyncInterval"), "HOT_RECONCILE");
  assert.equal(classifyRuntimeSettingKey("ENABLE_TLS_FINGERPRINT"), "RESTART_REQUIRED");
  assert.equal(classifyRuntimeSettingKey("DATA_DIR"), "BUILD_DEPLOY_ONLY");
});
