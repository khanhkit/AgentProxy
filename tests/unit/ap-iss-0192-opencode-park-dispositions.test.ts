import test from "node:test";
import assert from "node:assert/strict";

import { replayCandidates } from "../../open-sse/executors/opencodeParkResume.ts";

test("AP-ISS-0192 4233291776 replayCandidates never reorders caller-owned accounts", () => {
  const now = Date.now();
  const accounts = [
    { fingerprint: "third", cooldownUntil: now - 1, proxy: null },
    { fingerprint: "first", cooldownUntil: now - 1, proxy: null },
    { fingerprint: "second", cooldownUntil: now - 1, proxy: null },
  ];
  const before = accounts.map((account) => account.fingerprint);

  replayCandidates(accounts, now, () => null);

  assert.deepEqual(
    accounts.map((account) => account.fingerprint),
    before,
    "sorting filtered replay candidates must not mutate the caller-owned account array"
  );
});
