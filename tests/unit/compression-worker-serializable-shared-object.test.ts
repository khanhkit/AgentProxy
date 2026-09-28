import test from "node:test";
import assert from "node:assert/strict";
import { isStrictlySerializable } from "../../open-sse/services/compression/compressionWorkerProtocol.ts";

test("shared non-cyclic subobjects are serializable", () => {
  const shared = { value: 1 };
  assert.equal(isStrictlySerializable({ left: shared, right: shared }), true);
});

test("genuine cycles remain rejected", () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(isStrictlySerializable(cyclic), false);
});
