import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Codex reasoning honors enabled:false and whitelists wire keys", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "open-sse/executors/codex.ts"),
    "utf8"
  );

  assert.match(source, /const clientDisabledReasoning = reasoningRecord\?\.enabled === false/);
  assert.match(
    source,
    /clientDisabledReasoning \? "none" : fallbackReasoningEffort/
  );
  assert.match(source, /const wireReasoning =/);
  assert.match(
    source,
    /if \(key !== "effort" && key !== "summary"\) delete wireReasoning\[key\]/
  );
  assert.match(
    source,
    /if \(Object\.keys\(wireReasoning\)\.length === 0\) delete body\.reasoning/
  );
});
