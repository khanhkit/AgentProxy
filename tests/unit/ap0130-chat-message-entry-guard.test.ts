import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "src/sse/handlers/chat.ts"), "utf8");

test("AP-ISS-0130 rejects non-object messages entries before routing", () => {
  assert.match(source, /Array\.isArray\(msgBody\.messages\)[\s\S]{0,260}?msgBody\.messages\.some/);
  assert.match(
    source,
    /message === null \|\| typeof message !== "object" \|\| Array\.isArray\(message\)/
  );
  assert.match(source, /messages: Expected array of objects/);
});
