import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const history = fs.readFileSync(path.join(root, "src/lib/usage/usageHistory.ts"), "utf8");
const migration = fs.readFileSync(path.join(root, "src/lib/usage/migrations.ts"), "utf8");

test("TC-OMNIDB-USAGE-045A: live usage rows persist canonical provider ids", () => {
  assert.match(history, /import \{ resolveProviderId \} from "@\/shared\/constants\/providers"/);
  const start = history.indexOf("export async function saveRequestUsage");
  const body = history.slice(start);
  assert.ok((body.match(/entry\.provider \? resolveProviderId\(entry\.provider\) : null/g) ?? []).length >= 2);
});

test("TC-OMNIDB-USAGE-045B: legacy usage import canonicalizes provider aliases too", () => {
  assert.match(migration, /import \{ resolveProviderId \} from "@\/shared\/constants\/providers"/);
  assert.match(migration, /provider: entry\.provider \? resolveProviderId\(entry\.provider\) : null/);
});
