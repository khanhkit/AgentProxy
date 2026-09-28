import test from "node:test";
import assert from "node:assert/strict";

import { parseTokenExpiryMs, stopTokenHealthCheck } from "../../src/lib/tokenHealthCheck.ts";

stopTokenHealthCheck();

test("token expiry parser accepts numeric epoch strings and seconds", () => {
  const ms = Date.parse("2026-09-12T12:00:00.000Z");
  const seconds = Math.floor(ms / 1000);

  assert.equal(parseTokenExpiryMs(String(ms)), ms);
  assert.equal(parseTokenExpiryMs(String(seconds)), seconds * 1000);
  assert.equal(parseTokenExpiryMs(seconds), seconds * 1000);
  assert.equal(parseTokenExpiryMs("2026-09-12T12:00:00.000Z"), ms);
});
