import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/db/discovery.ts"), "utf8");

test("TC-OMNIDB-DISC-040: discovery logger uses the workspace alias, not a rotted relative path", () => {
  assert.match(source, /from "@agentproxy\/open-sse\/utils\/logger"/);
  assert.doesNotMatch(source, /\.\.\/\.\.\/open-sse\/utils\/logger/);
});
