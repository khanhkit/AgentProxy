import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/(dashboard)/dashboard/playground/components/CompareColumn.tsx"),
  "utf8"
);

test("AP-ISS-0130 Compare column copies only its own response", () => {
  assert.match(source, /useCopyToClipboard\(\)/);
  assert.match(source, /onClick=\{\(\) => void copy\(response, id\)\}/);
});

test("AP-ISS-0130 Compare copy disables on empty response and shows copied state", () => {
  assert.match(source, /disabled=\{response === ""\}/);
  assert.match(source, /copied === id \? "check" : "content_copy"/);
});
