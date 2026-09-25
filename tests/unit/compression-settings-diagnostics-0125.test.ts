import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "src/lib/db/compression.ts"), "utf8");

test("TC-OMNIDB-COMP-035A: non-string compression rows warn before skip", () => {
  assert.match(source, /typeof record\.value !== "string" && record\.value !== null/);
  assert.match(source, /Settings row '\$\{key\}' has non-string value type/);
  assert.match(source, /backup\/restore/);
});

test("TC-OMNIDB-COMP-035B: unparseable JSON compression rows warn before skip", () => {
  assert.match(source, /if \(parsed === undefined\) \{/);
  assert.match(source, /Settings row '\$\{key\}' has unparseable JSON value/);
});

test("TC-OMNIDB-COMP-035C: malformed engines row warns but valid empty object remains legitimate", () => {
  assert.match(source, /storedEngines === null && \(!parsed \|\| typeof parsed !== "object"\)/);
  assert.match(source, /'engines' settings row is present but unreadable/);
});
