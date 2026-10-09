import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Electron security lock uses patched fast-uri 3.x", () => {
  const lock = JSON.parse(fs.readFileSync("electron/package-lock.json", "utf8"));
  assert.equal(lock.packages?.["node_modules/fast-uri"]?.version, "3.1.8");
});
