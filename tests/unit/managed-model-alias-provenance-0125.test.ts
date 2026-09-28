import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const aliases = fs.readFileSync(path.join(root, "src/lib/db/models/aliases.ts"), "utf8");
const models = fs.readFileSync(path.join(root, "src/lib/db/models.ts"), "utf8");

test("TC-OMNIDB-ALIAS-046A: managed alias provenance persists in its own namespace", () => {
  assert.match(aliases, /managedModelAliasNames/);
  assert.match(aliases, /export async function getManagedModelAliasNames\(\): Promise<Set<string>>/);
  assert.match(aliases, /export async function markManagedModelAlias\(alias: string\): Promise<void>/);
  assert.match(aliases, /export async function unmarkManagedModelAlias\(alias: string\): Promise<void>/);
});

test("TC-OMNIDB-ALIAS-046B: deleting a model alias also clears its managed marker", () => {
  const start = aliases.indexOf("export async function deleteModelAlias");
  const end = aliases.indexOf("\n}", start);
  const body = aliases.slice(start, end + 2);
  assert.match(body, /await unmarkManagedModelAlias\(alias\)/);
});

test("TC-OMNIDB-ALIAS-046C: provenance helpers are exported through models facade", () => {
  assert.match(models, /getManagedModelAliasNames/);
  assert.match(models, /markManagedModelAlias/);
  assert.match(models, /unmarkManagedModelAlias/);
});
