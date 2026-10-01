import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { partialWithoutDefaults } from "../../src/shared/validation/partialWithoutDefaults.ts";

const source = z
  .object({
    name: z.string().min(1),
    enabled: z.boolean().optional().default(true),
    priority: z.number().default(0),
  })
  .strict();

test("AP-ISS-0130 omitted update fields do not reapply creation defaults", () => {
  assert.deepEqual(partialWithoutDefaults(source).parse({ name: "n" }), { name: "n" });
  assert.deepEqual(partialWithoutDefaults(source).parse({}), {});
});

test("AP-ISS-0130 explicit update values remain validated", () => {
  const update = partialWithoutDefaults(source);
  assert.deepEqual(update.parse({ enabled: false, priority: 3 }), { enabled: false, priority: 3 });
  assert.equal(update.safeParse({ priority: "high" }).success, false);
  assert.equal(update.safeParse({ typo: 1 }).success, false);
});
