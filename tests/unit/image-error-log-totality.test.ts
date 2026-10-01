import test from "node:test";
import assert from "node:assert/strict";
import { stringifyImageErrorForLog } from "../../open-sse/handlers/imageErrorLog.ts";

test("image error log stringifier handles null-prototype and circular values", () => {
  const nullProto = Object.create(null) as Record<string, unknown>;
  nullProto.message = "provider failed";
  assert.equal(stringifyImageErrorForLog(nullProto), '{"message":"provider failed"}');

  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.doesNotThrow(() => stringifyImageErrorForLog(circular));
});

test("image error log stringifier handles hostile Error fields", () => {
  const err = new Error("secret");
  Object.defineProperty(err, "message", { get() { throw new Error("boom"); } });
  assert.doesNotThrow(() => stringifyImageErrorForLog(err));
  assert.match(stringifyImageErrorForLog(err), /^Error:/);
});
