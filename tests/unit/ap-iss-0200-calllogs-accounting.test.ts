import test from "node:test";
import assert from "node:assert/strict";
import { getDbInstance, resetDbInstance } from "../../src/lib/db/core.ts";
import { iterateCallLogsSince, saveCallLog } from "../../src/lib/usage/callLogs.ts";
import {
  clearPendingRequests,
  getPendingById,
  trackPendingRequest,
} from "../../src/lib/usage/usageHistory.ts";

test.afterEach(() => clearPendingRequests());
test.after(() => resetDbInstance());

test("AP-ISS-0200 4233407209: durable log id alone cannot mutate an unrelated pending request", async () => {
  const pendingId = trackPendingRequest("model", "provider", "conn-ap0200", true);
  assert.ok(pendingId);
  await saveCallLog({
    id: pendingId,
    status: 200,
    tokens: { input_tokens: 91, output_tokens: 17 },
    clientResponse: { choices: [{ message: { content: "ok" } }] },
  });
  assert.equal(getPendingById().get(pendingId)?.tokens, undefined);
  getDbInstance().prepare("DELETE FROM call_logs WHERE id = ?").run(pendingId);
});

test("AP-ISS-0200 4233407680: iterator limit counts yielded logs, not rows deleted during hydration", async () => {
  const ids = ["ap0200-export-old", "ap0200-export-mid", "ap0200-export-new"];
  const timestamps = ["2098-01-01T00:00:01.000Z", "2098-01-01T00:00:02.000Z", "2098-01-01T00:00:03.000Z"];
  for (let i = 0; i < ids.length; i++) {
    await saveCallLog({ id: ids[i], timestamp: timestamps[i], status: 200, tokens: {}, clientResponse: { choices: [{ message: { content: ids[i] } }] } });
  }
  const iterator = iterateCallLogsSince("2098-01-01T00:00:00.000Z", 2);
  try {
    const first = await iterator.next();
    assert.equal((first.value as { id?: string })?.id, ids[2]);
    getDbInstance().prepare("DELETE FROM call_logs WHERE id = ?").run(ids[1]);
    const second = await iterator.next();
    assert.equal(second.done, false, "a deleted hydration row must not consume the yield limit");
    assert.equal((second.value as { id?: string })?.id, ids[0]);
  } finally {
    await iterator.return();
    const stmt = getDbInstance().prepare("DELETE FROM call_logs WHERE id = ?");
    for (const id of ids) stmt.run(id);
  }
});
