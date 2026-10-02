import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scriptPath = new URL("../../../scripts/dev/run-standalone.mjs", import.meta.url);
const scriptSrc = readFileSync(scriptPath, "utf8");

test("standalone launcher uses process.execPath instead of a hardcoded node binary", () => {
  assert.doesNotMatch(scriptSrc, /spawn\(\s*["']node["']/);
  assert.match(scriptSrc, /spawn\(\s*process\.execPath\s*,/);
});
